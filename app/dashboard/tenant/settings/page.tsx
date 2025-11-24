'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import Link from 'next/link'

export default function TenantSettingsPage() {
  const { toast } = useToast()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/settings/profile', { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load profile.')
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

  const handleSave = async () => {
    try {
      setSaving(true)
      const res = await fetch('/api/settings/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, phone_number: phone }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to update profile.')
      toast({ title: 'Profile updated', description: 'Your details have been saved.' })
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Profile Settings</h1>
        <Link href="/dashboard/tenant" className="text-sm text-blue-600 hover:underline">
          Back to dashboard
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={loading || saving}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={email} disabled />
            <p className="text-xs text-muted-foreground">Email cannot be changed from the tenant portal.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={loading || saving}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? 'Saving…' : 'Update Profile'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
