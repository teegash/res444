'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Lock, Loader2, CheckCircle2, AlertCircle, ArrowLeft, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createClient } from '@/lib/supabase/client'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isInvalidLink, setIsInvalidLink] = useState(false)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState<string | null>(null)
  const [hasSession, setHasSession] = useState(false)
  const [recoveryTokenHash, setRecoveryTokenHash] = useState<string | null>(null)
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null)
  const [recoveryEmail, setRecoveryEmail] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const parseHashTokens = () => {
      if (typeof window === 'undefined') return null
      const raw = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
      if (!raw) return null
      const params = new URLSearchParams(raw)
      const at = params.get('access_token')
      const rt = params.get('refresh_token')
      const type = params.get('type')
      if (!at || !rt || type !== 'recovery') return null
      return { access_token: at, refresh_token: rt }
    }

    const parseHashTokenHash = () => {
      if (typeof window === 'undefined') return null
      const raw = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
      if (!raw) return null
      const params = new URLSearchParams(raw)
      const tokenHash = params.get('token_hash')
      const type = params.get('type')
      if (!tokenHash || type !== 'recovery') return null
      return { token_hash: tokenHash }
    }

    const init = async () => {
      setIsInitializing(true)
      const code = searchParams.get('code')
      if (code) {
        // In PKCE mode, exchanging the code relies on the stored code_verifier cookie.
        // Hand off to the server callback to perform the exchange and then redirect back here.
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          url.searchParams.delete('code')
          const callback = new URL('/auth/callback', url.origin)
          callback.searchParams.set('code', code)
          callback.searchParams.set('next', '/auth/reset-password')
          callback.searchParams.set('returnTo', url.pathname + url.search)
          window.location.replace(callback.toString())
          return
        }
      }

      const queryAccess = searchParams.get('access_token')
      const queryRefresh = searchParams.get('refresh_token')
      const queryType = searchParams.get('type')
      const queryTokenHash = searchParams.get('token_hash')
      const queryToken = searchParams.get('token')
      const queryEmail = searchParams.get('email')

      if (queryAccess && queryRefresh && queryType === 'recovery') {
        if (cancelled) return
        setAccessToken(queryAccess)
        setRefreshToken(queryRefresh)
        setIsInvalidLink(false)
        setError(null)
        setIsInitializing(false)
        return
      }

      const hashTokens = parseHashTokens()
      if (hashTokens) {
        if (cancelled) return
        setAccessToken(hashTokens.access_token)
        setRefreshToken(hashTokens.refresh_token)
        setIsInvalidLink(false)
        setError(null)
        setIsInitializing(false)

        // Remove tokens from the URL bar (they were in the hash).
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', window.location.pathname + window.location.search)
        }
        return
      }

      // Some Supabase configurations send `token_hash` + `type=recovery` (or legacy token+email).
      // Do NOT redeem these tokens on page load (email clients / scanners can invalidate them).
      // Instead, keep them in state and redeem inside the reset-password API call on submit.
      const tokenHashFromHash = parseHashTokenHash()
      const tokenHash = queryType === 'recovery' ? queryTokenHash : null
      const supabase = createClient()

      if (tokenHash) {
        if (cancelled) return
        setRecoveryTokenHash(tokenHash)
        setIsInvalidLink(false)
        setHasSession(false)
        setError(null)
        setIsInitializing(false)

        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          url.searchParams.delete('token_hash')
          url.searchParams.delete('type')
          window.history.replaceState({}, '', url.pathname + url.search)
        }
        return
      }

      if (tokenHashFromHash) {
        if (cancelled) return
        setRecoveryTokenHash(tokenHashFromHash.token_hash)
        setIsInvalidLink(false)
        setHasSession(false)
        setError(null)
        setIsInitializing(false)

        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', window.location.pathname + window.location.search)
        }
        return
      }

      // Legacy format: token + email + type=recovery
      if (queryType === 'recovery' && queryToken && queryEmail) {
        if (cancelled) return
        setRecoveryEmail(queryEmail)
        setRecoveryToken(queryToken)
        setIsInvalidLink(false)
        setHasSession(false)
        setError(null)
        setIsInitializing(false)

        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          url.searchParams.delete('token')
          url.searchParams.delete('email')
          url.searchParams.delete('type')
          window.history.replaceState({}, '', url.pathname + url.search)
        }
        return
      }

      // Fallback: if the user already has a valid session cookie, allow password change.
      // Otherwise, treat as an invalid/expired link.
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (cancelled) return

      if (session) {
        setHasSession(true)
        setIsInvalidLink(false)
        setError(null)
        setIsInitializing(false)
        return
      }

      setHasSession(false)
      setIsInvalidLink(true)
      setError('Invalid or expired reset link. Please request a new password reset.')
      setIsInitializing(false)
    }

    init()

    return () => {
      cancelled = true
    }
  }, [router, searchParams])

  const validatePassword = (pwd: string) => {
    if (pwd.length < 8) {
      return 'Password must be at least 8 characters long'
    }
    if (!/[A-Z]/.test(pwd)) {
      return 'Password must contain at least one uppercase letter'
    }
    if (!/\d/.test(pwd)) {
      return 'Password must contain at least one number'
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    // Validate passwords
    const passwordError = validatePassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password,
          access_token: accessToken,
          refresh_token: refreshToken,
          token_hash: recoveryTokenHash,
          token: recoveryToken,
          email: recoveryEmail,
        }),
      })

      const result = await response.json()

      if (result.success) {
        setSuccess('Password reset successfully!')
        setTimeout(() => {
          router.push('/auth/login')
        }, 2000)
      } else {
        setError(result.error || 'Failed to reset password')
        setIsLoading(false)
      }
    } catch (err) {
      setError('An unexpected error occurred')
      setIsLoading(false)
    }
  }

  // If invalid link, show message with go back button
  if (isInvalidLink) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 border border-border shadow-lg">
          <div className="text-center space-y-6">
            {/* Icon */}
            <div className="flex justify-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
                <AlertCircle className="w-8 h-8 text-destructive" />
              </div>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">
                Invalid Reset Link
              </h1>
              <p className="text-sm text-muted-foreground">
                This password reset link is invalid or has expired.
              </p>
            </div>

            {/* Message */}
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <p className="text-sm text-foreground">
                Please request a new password reset link from the login page.
              </p>
            </div>

            {/* Go Back Button */}
            <div className="pt-4">
              <Button
                onClick={() => router.push('/auth/login')}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Go Back to Login
              </Button>
            </div>
          </div>
        </Card>
      </main>
    )
  }

  if (isInitializing) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 border border-border shadow-lg">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <div className="space-y-1">
              <div className="text-lg font-semibold text-foreground">Preparing password reset…</div>
              <div className="text-sm text-muted-foreground">Please wait a moment.</div>
            </div>
          </div>
        </Card>
      </main>
    )
  }

  // If success, show success message with go back button
  if (success) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 border border-border shadow-lg">
          <div className="text-center space-y-6">
            {/* Icon */}
            <div className="flex justify-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">
                Password Reset Successful
              </h1>
              <p className="text-sm text-muted-foreground">
                Your password has been successfully reset.
              </p>
            </div>

            {/* Message */}
            <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-4 border border-green-200 dark:border-green-900">
              <p className="text-sm text-green-800 dark:text-green-200">
                You can now log in with your new password.
              </p>
            </div>

            {/* Go Back Button */}
            <div className="pt-4">
              <Button
                onClick={() => router.push('/auth/login')}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Go Back to Login
              </Button>
            </div>
          </div>
        </Card>
      </main>
    )
  }

  // Show reset password form
  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 border border-border shadow-lg">
        <div className="mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
              <Lock className="w-6 h-6 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2 text-center">
            Reset Password
          </h1>
          <p className="text-sm text-muted-foreground text-center">
            Enter your new password below
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* New Password */}
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">
              New Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                disabled={isLoading}
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Must be at least 8 characters with uppercase and number
            </p>
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-sm font-medium">
              Confirm Password
            </Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isLoading}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                disabled={isLoading}
              >
                {showConfirmPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={
              isLoading ||
              (!(accessToken && refreshToken) && !hasSession && !recoveryTokenHash && !(recoveryToken && recoveryEmail))
            }
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Resetting Password...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Reset Password
              </div>
            )}
          </Button>

          {/* Go Back Link */}
          <div className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push('/auth/login')}
              className="w-full text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Login
            </Button>
          </div>
        </form>
      </Card>
    </main>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 border border-border shadow-lg">
          <div className="flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        </Card>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  )
}
