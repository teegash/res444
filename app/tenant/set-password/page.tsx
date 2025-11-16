'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function TenantSetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])

  const tokenHash = searchParams.get('token_hash') || ''
  const emailParam = searchParams.get('email') || ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!tokenHash || !emailParam) {
      setError('This invitation link is invalid or has expired.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setError(null)
    setSubmitting(true)

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        type: 'signup',
        token_hash: tokenHash,
        email: emailParam,
      })

      if (verifyError) {
        throw verifyError
      }

      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        throw updateError
      }

      setSuccess('Password set successfully. Redirecting to login…')
      setTimeout(() => {
        router.replace(`/auth/login?email=${encodeURIComponent(emailParam)}`)
      }, 1500)
    } catch (err) {
      console.error('[TenantSetPassword] verifyOtp error:', err)
      setError(err instanceof Error ? err.message : 'Unable to set password. Please request a new invitation.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader>
          <CardTitle className="text-center">Set your password</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-6 text-center">
            Set a password for <span className="font-semibold">{emailParam || 'your account'}</span> to finish activating your tenant portal.
          </p>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <Label>Email</Label>
              <Input value={emailParam} disabled className="bg-muted" />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <div>
              <Label>Confirm password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full bg-[#4682B4] hover:bg-[#3b6a91]" disabled={submitting || !tokenHash || !emailParam}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Setting password…
                </>
              ) : (
                'Set password'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
