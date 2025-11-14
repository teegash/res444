'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Mail, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const result = await response.json()

      if (result.success) {
        setSuccess(result.message || 'Password reset email sent. Please check your inbox.')
      } else {
        setError(result.error || 'Failed to send password reset email')
      }
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white shadow-xl">
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="flex items-center justify-center w-12 h-12 bg-blue-600 rounded-lg">
                <Mail className="w-7 h-7 text-white" />
              </div>
              <div className="text-left">
                <h1 className="text-xl font-bold text-blue-600">RentalKenya</h1>
                <p className="text-xs text-gray-600 font-medium">
                  Password Recovery
                </p>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              Forgot Password?
            </h2>
            <p className="text-sm text-gray-600">
              Enter your email address and we'll send you a link to reset your password
            </p>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="mb-4 border-green-500 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                {success}
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="bg-white border-gray-300 focus:border-blue-600 focus:ring-blue-600"
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full text-white font-medium py-5 text-base bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </div>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Send Reset Link
                </>
              )}
            </Button>
          </form>

          <div className="text-center mt-6">
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Login
            </Link>
          </div>
        </div>
      </Card>
    </div>
  )
}

