'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'

export default function AccountSecurityPage() {
  const { toast } = useToast()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/settings/profile', { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Failed to load profile.')
        }
        setFullName(json.data?.full_name || '')
        setPhone(json.data?.phone_number || '')
        setEmail(json.data?.email || '')
      } catch (err) {
        toast({
          title: 'Unable to load profile',
          description: err instanceof Error ? err.message : 'Unexpected error',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    }
    loadProfile()
  }, [toast])

  const saveProfile = async () => {
    try {
      setSavingProfile(true)
      const res = await fetch('/api/settings/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, phone_number: phone }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to save profile')
      toast({ title: 'Profile updated' })
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      })
    } finally {
      setSavingProfile(false)
    }
  }

  const changePassword = async () => {
    if (!newPassword || newPassword !== confirmPassword) {
      toast({ title: 'Passwords must match', variant: 'destructive' })
      return
    }
    try {
      setPasswordSaving(true)
      const res = await fetch('/api/settings/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to change password')
      setNewPassword('')
      setConfirmPassword('')
      toast({ title: 'Password changed' })
    } catch (err) {
      toast({
        title: 'Password update failed',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      })
    } finally {
      setPasswordSaving(false)
    }
  }

  const sendReset = async () => {
    try {
      setResetting(true)
      const res = await fetch('/api/settings/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to send reset email')
      toast({ title: 'Reset email sent', description: 'Check your inbox for reset instructions.' })
    } catch (err) {
      toast({
        title: 'Reset failed',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      })
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Account & Security</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Full Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={loading || savingProfile} />
          </div>
          <div className="grid gap-2">
            <Label>Email</Label>
            <Input value={email} disabled />
          </div>
          <div className="grid gap-2">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={loading || savingProfile} />
          </div>
          <div className="flex justify-end">
            <Button onClick={saveProfile} disabled={savingProfile || loading}>
              {savingProfile ? 'Saving…' : 'Save Profile'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password & Login</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>New Password</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Confirm Password</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button onClick={changePassword} disabled={passwordSaving}>
              {passwordSaving ? 'Updating…' : 'Change Password'}
            </Button>
            <Button variant="outline" onClick={sendReset} disabled={resetting}>
              {resetting ? 'Sending…' : 'Send Reset Email'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            We do not show previous passwords. Use the reset link if you cannot recall your current password.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
