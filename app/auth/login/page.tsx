'use client'

import { useState, useEffect, Suspense, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Shield, Crown, Loader2, ArrowLeft, Info, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuth } from '@/lib/auth/context'
import { createClient } from '@/lib/supabase/client'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  
  // Get tab from URL parameter, default to tenant
  const tabParam = searchParams.get('tab')
  const [accountType, setAccountType] = useState<'tenant' | 'admin'>(
    tabParam === 'manager' ? 'admin' : 'tenant'
  )
  
  const [error, setError] = useState<string | null>(null)
  const [showTenantMessage, setShowTenantMessage] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })

  const redirectTo = searchParams.get('redirectTo') || '/dashboard'
  const registered = searchParams.get('registered') === 'true'
  const registeredEmail = searchParams.get('email')

  // Update account type when tab parameter changes
  useEffect(() => {
    if (tabParam === 'manager') {
      setAccountType('admin')
    } else if (tabParam === 'tenant') {
      setAccountType('tenant')
    }
  }, [tabParam])

  useEffect(() => {
    if (!authLoading && user) {
      router.push(redirectTo)
    }
  }, [user, authLoading, router, redirectTo])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      // Sign in directly via Supabase client with strict timeout
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new Error(
              'Sign in request timed out. Please check your connection and try again.'
            )
          )
        }, 8000)
      })

      let signInResult:
        | Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>
        | undefined

      try {
        signInResult = await Promise.race([
          supabase.auth.signInWithPassword({
            email: formData.email,
            password: formData.password,
          }),
          timeoutPromise,
        ])
      } catch (raceError) {
        setError(
          raceError instanceof Error
            ? raceError.message
            : 'Sign in request failed. Please try again.'
        )
        setIsLoading(false)
        return
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
      }

      if (!signInResult) {
        setError('Sign in failed. Please try again.')
        setIsLoading(false)
        return
      }

      const { data, error } = signInResult

      if (error) {
        const errorMessage =
          error.message || 'Failed to sign in. Please check your credentials.'

        if (errorMessage.includes('Email not confirmed')) {
          setError(
            'Please verify your email address before logging in. Check your inbox for the verification link.'
          )
        } else if (errorMessage.includes('Invalid login credentials')) {
          setError('Invalid email or password. Please try again.')
        } else {
          setError(errorMessage)
        }
        setIsLoading(false)
        return
      }

      const userRole = data.user?.user_metadata?.role?.toLowerCase()

      if (!userRole) {
        setError('Unable to determine user role. Please contact support.')
        setIsLoading(false)
        return
      }

      if (accountType === 'tenant') {
        if (userRole !== 'tenant') {
          setError('This account is not a tenant account. Please use the Manager login tab.')
          setIsLoading(false)
          return
        }
        router.push('/dashboard/tenant')
        router.refresh()
      } else {
        const allowedRoles = ['admin', 'manager', 'caretaker']
        if (!allowedRoles.includes(userRole)) {
          setError(`This account (${userRole}) is not authorized for manager access. Please use the Tenant login tab.`)
          setIsLoading(false)
          return
        }
        router.push('/dashboard')
        router.refresh()
      }
    } catch (err) {
      setError('An unexpected error occurred')
      setIsLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    setError(null)
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white shadow-xl">
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="flex items-center justify-center w-12 h-12 bg-blue-600 rounded-lg">
                <svg
                  className="w-7 h-7 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
              <div className="text-left">
                <h1 className="text-xl font-bold text-blue-600">RentalKenya</h1>
                <p className="text-xs text-gray-600 font-medium">
                  Manager Portal
                </p>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              Welcome Back
            </h2>
            <p className="text-sm text-gray-600">
              Sign in to your premium account
            </p>
          </div>

          {registered && registeredEmail && (
            <Alert className="mb-4 border-green-500 bg-green-50 dark:bg-green-950/20">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                Account created successfully! Please check your email ({registeredEmail}) to confirm your account before logging in.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Tenant Signup Message */}
          {showTenantMessage ? (
            <div className="space-y-6">
              <div className="text-center space-y-4">
                {/* Icon */}
                <div className="flex justify-center">
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-blue-100">
                    <Info className="w-8 h-8 text-blue-600" />
                  </div>
                </div>

                {/* Title */}
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-gray-900">
                    Tenant Registration
                  </h2>
                  <p className="text-sm text-gray-600">
                    Tenants cannot self-register
                  </p>
                </div>

                {/* Message */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <p className="text-sm text-gray-700 leading-relaxed">
                    Please contact your property manager for account credentials. 
                    Tenants cannot self-register on this platform.
                  </p>
                </div>

                {/* Back Button */}
                <div className="pt-4">
                  <Button
                    type="button"
                    onClick={() => setShowTenantMessage(false)}
                    variant="outline"
                    className="w-full border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Login
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <div className="flex rounded-lg border-2 border-gray-100 p-1 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => {
                      setAccountType('tenant')
                      setShowTenantMessage(false)
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-all ${
                      accountType === 'tenant'
                        ? 'bg-white text-blue-600 shadow-sm font-medium'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                    Tenant
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountType('admin')
                      setShowTenantMessage(false)
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-all ${
                      accountType === 'admin'
                        ? 'bg-white text-blue-600 shadow-sm font-medium'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Crown className="w-4 h-4" />
                    Manager
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-sm font-medium text-gray-700"
              >
                Email
              </label>
              <Input
                id="email"
                type="email"
                name="email"
                placeholder="your@email.com"
                value={formData.email}
                onChange={handleChange}
                required
                disabled={isLoading}
                className="bg-white border-gray-300 focus:border-blue-600 focus:ring-blue-600"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  disabled={isLoading}
                  className="bg-white border-gray-300 focus:border-blue-600 focus:ring-blue-600 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className={`w-full text-white font-medium py-5 text-base transition-all ${
                accountType === 'admin'
                  ? 'bg-gradient-to-r from-orange-600 to-yellow-600 hover:from-orange-700 hover:to-yellow-700 shadow-lg shadow-orange-500/50'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </div>
              ) : (
                <>
                  <Shield className="w-4 h-4 mr-2" />
                  Sign In as {accountType === 'tenant' ? 'Tenant' : 'Manager'}
                </>
              )}
            </Button>
          </form>

          <div className="text-center mt-4">
            <Link
              href="/auth/forgot-password"
              className="text-sm text-blue-600 font-semibold hover:text-blue-700 underline"
            >
              Forgot password?
            </Link>
          </div>

          <div className="text-center mt-4">
            <p className="text-sm text-gray-600">
              Don't have an account?{' '}
              {accountType === 'tenant' ? (
                <button
                  type="button"
                  onClick={() => setShowTenantMessage(true)}
                  className="text-blue-600 font-semibold hover:text-blue-700 underline"
                >
                  Sign up
                </button>
              ) : (
                <Link
                  href="/auth/signup"
                  className="text-blue-600 font-semibold hover:text-blue-700 underline"
                >
                  Sign up
                </Link>
              )}
            </p>
          </div>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
