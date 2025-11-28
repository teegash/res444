'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/components/ui/use-toast'

export default function GetStartedPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [code, setCode] = useState('')
  const [loadingValidate, setLoadingValidate] = useState(false)
  const [loadingRequest, setLoadingRequest] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)

  const handleRequestCode = async () => {
    try {
      setLoadingRequest(true)
      setErrorMessage(null)
      setInfoMessage(null)
      const res = await fetch('/api/invite/request', { method: 'POST' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to request access code.')
      }
      setInfoMessage('Access code requested. The admin will share it with you.')
      toast({ title: 'Code requested', description: 'Admin will share the access code with you shortly.' })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to request code.')
      toast({
        title: 'Request failed',
        description: error instanceof Error ? error.message : 'Unable to request code.',
        variant: 'destructive',
      })
    } finally {
      setLoadingRequest(false)
    }
  }

  const handleValidate = async () => {
    if (!code.trim()) {
      setErrorMessage('Enter the access code.')
      return
    }
    try {
      setLoadingValidate(true)
      setErrorMessage(null)
      setInfoMessage(null)
      const res = await fetch('/api/invite/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || 'Invalid code.')
      }
      toast({ title: 'Access granted', description: 'Redirecting to sign up…' })
      const next = payload.redirect || '/auth/signup'
      router.push(next)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to validate code.')
      toast({
        title: 'Validation failed',
        description: error instanceof Error ? error.message : 'Unable to validate code.',
        variant: 'destructive',
      })
    } finally {
      setLoadingValidate(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <Card className="max-w-xl w-full shadow-lg">
        <CardHeader>
          <CardTitle>Access required</CardTitle>
          <CardDescription>Enter the access code shared by the admin to continue to signup.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
          {infoMessage && (
            <Alert>
              <AlertDescription>{infoMessage}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Input
              placeholder="Enter access code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={loadingValidate}
            />
            <Button onClick={handleValidate} disabled={loadingValidate} className="w-full">
              {loadingValidate ? 'Verifying…' : 'Continue to sign up'}
            </Button>
          </div>

          <div className="border-t pt-4 space-y-2">
            <p className="text-sm text-muted-foreground">
              Don’t have a code? Request one and the admin (nategadgets@gmail.com) will share it with you.
            </p>
            <Button variant="outline" onClick={handleRequestCode} disabled={loadingRequest} className="w-full">
              {loadingRequest ? 'Requesting…' : 'Request access code'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
