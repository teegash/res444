'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Lock, Palette, Users } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { useTheme } from 'next-themes'
import { createClient } from '@/lib/supabase/client'

type TeamMember = {
  id: string
  email: string | null
  full_name: string | null
  role: string
  property_id?: string | null
  property_name?: string | null
  property_location?: string | null
}

export default function SettingsPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [activeTab, setActiveTab] = useState('account')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [teamError, setTeamError] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteRole, setInviteRole] = useState<'manager' | 'caretaker'>('manager')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [invitePassword, setInvitePassword] = useState('')
  const [inviteConfirmPassword, setInviteConfirmPassword] = useState('')
  const [inviteSaving, setInviteSaving] = useState(false)
  const [invitePropertyId, setInvitePropertyId] = useState('')
  const [properties, setProperties] = useState<Array<{ id: string; name: string }>>([])
  const [propertiesLoading, setPropertiesLoading] = useState(false)
  const [propertiesError, setPropertiesError] = useState<string | null>(null)
  const { setTheme, theme } = useTheme()
  const { toast } = useToast()

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setProfileLoading(true)
        const res = await fetch('/api/settings/profile', { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Failed to load profile.')
        }
        setFullName(json.data?.full_name || '')
        setPhone(json.data?.phone_number || '')
        setEmail(json.data?.email || '')
      } catch (err) {
        setProfileError(err instanceof Error ? err.message : 'Unable to load profile.')
      } finally {
        setProfileLoading(false)
      }
    }

    const loadTeam = async () => {
      try {
        const res = await fetch('/api/settings/team', { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Failed to load team.')
        }
        setTeamMembers(json.data || [])
      } catch (err) {
        setTeamError(err instanceof Error ? err.message : 'Unable to load team.')
      }
    }

    loadProfile()
    loadTeam()
    const loadProperties = async () => {
      try {
        setPropertiesLoading(true)
        const res = await fetch('/api/properties', { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Failed to load properties.')
        }
        const opts =
          (json.data || []).map((p: any) => ({
            id: p.id,
            name: p.name || 'Unnamed property',
          })) || []
        setProperties(opts)
      } catch (err) {
        setPropertiesError(err instanceof Error ? err.message : 'Unable to load properties.')
      } finally {
        setPropertiesLoading(false)
      }
    }

    loadProperties()
  }, [])

  const handleProfileSave = async () => {
    try {
      setSavingProfile(true)
      const res = await fetch('/api/settings/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, phone_number: phone }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update profile.')
      }
      toast({ title: 'Profile updated', description: 'Your profile was saved successfully.' })
    } catch (err) {
      toast({
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Unable to save profile.',
        variant: 'destructive',
      })
    } finally {
      setSavingProfile(false)
    }
  }

  const handlePasswordChange = async () => {
    if (!newPassword || newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' })
      return
    }
    try {
      setPasswordSaving(true)
      const res = await fetch('/api/settings/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword, oldPassword }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to change password.')
      }
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast({ title: 'Password updated', description: 'Your password has been changed.' })
    } catch (err) {
      toast({
        title: 'Password change failed',
        description: err instanceof Error ? err.message : 'Unable to change password.',
        variant: 'destructive',
      })
    } finally {
      setPasswordSaving(false)
    }
  }

  const handlePasswordReset = async () => {
    try {
      setResettingPassword(true)
      const normalizedEmail = email.trim().toLowerCase()
      if (!normalizedEmail) throw new Error('Missing email.')

      const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
      const siteUrl = configuredSiteUrl || (typeof window !== 'undefined' ? window.location.origin : '')

      // IMPORTANT:
      // When using `{{ .ConfirmationURL }}` with PKCE, the browser must store the code_verifier
      // when requesting the reset email. That means we must call resetPasswordForEmail in the browser.
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${siteUrl}/auth/reset-password`,
      })

      // Always show success to avoid email enumeration; log failures for debugging.
      if (error) console.error('[Settings.PasswordReset] resetPasswordForEmail failed', error)

      toast({ title: 'Reset email sent', description: 'If an account exists, check your inbox for reset instructions.' })
    } catch (err) {
      toast({
        title: 'Reset failed',
        description: err instanceof Error ? err.message : 'Unable to start reset.',
        variant: 'destructive',
      })
    } finally {
      setResettingPassword(false)
    }
  }

  const handleInvite = async () => {
    if (!inviteEmail || !inviteName || !invitePassword) {
      toast({ title: 'Missing info', description: 'Name, email, and password are required.', variant: 'destructive' })
      return
    }
    if (inviteRole === 'caretaker' && !invitePropertyId) {
      toast({
        title: 'Select property',
        description: 'Caretakers must be scoped to a property.',
        variant: 'destructive',
      })
      return
    }
    if (invitePassword.length < 8) {
      toast({ title: 'Weak password', description: 'Password must be at least 8 characters.', variant: 'destructive' })
      return
    }
    if (invitePassword !== inviteConfirmPassword) {
      toast({ title: 'Password mismatch', description: 'Passwords must match.', variant: 'destructive' })
      return
    }
    try {
      setInviteSaving(true)
      const res = await fetch('/api/settings/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          full_name: inviteName,
          role: inviteRole,
          password: invitePassword,
          property_id: inviteRole === 'caretaker' ? invitePropertyId : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to invite member.')
      }
      setInviteEmail('')
      setInviteName('')
      setInvitePassword('')
      setInviteConfirmPassword('')
      setInvitePropertyId('')
      setInviteOpen(false)
      toast({ title: 'Invite sent', description: 'Credentials have been emailed to the member.' })
      // refresh team
      const teamRes = await fetch('/api/settings/team', { cache: 'no-store' })
      const teamJson = await teamRes.json()
      if (teamRes.ok && teamJson.success) {
        setTeamMembers(teamJson.data || [])
      }
    } catch (err) {
      toast({
        title: 'Invite failed',
        description: err instanceof Error ? err.message : 'Unable to send invite.',
        variant: 'destructive',
      })
    } finally {
      setInviteSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Back button and header */}
      <div className="flex items-center gap-2 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-3xl font-bold">Settings</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="account" className="gap-2">
            <Lock className="w-4 h-4" />
            <span className="hidden sm:inline">Account</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2">
            <Palette className="w-4 h-4" />
            <span className="hidden sm:inline">Appearance</span>
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-2">
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Team</span>
          </TabsTrigger>
        </TabsList>

        {/* Account Settings */}
        <TabsContent value="account" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={profileLoading || savingProfile}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={email} disabled />
                <p className="text-xs text-muted-foreground">Email is managed by your administrator.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={profileLoading || savingProfile}
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleProfileSave} disabled={profileLoading || savingProfile}>
                  {savingProfile ? 'Saving...' : 'Update Profile'}
                </Button>
              </div>
              {profileError && <p className="text-sm text-destructive">{profileError}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="oldPassword">Current Password</Label>
                <Input
                  id="oldPassword"
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  disabled={passwordSaving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={passwordSaving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={passwordSaving}
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                <Button variant="default" className="w-full sm:w-auto" onClick={handlePasswordChange} disabled={passwordSaving}>
                  {passwordSaving ? 'Updating…' : 'Change Password'}
                </Button>
                <Button variant="outline" className="w-full sm:w-auto" onClick={handlePasswordReset} disabled={resettingPassword}>
                  {resettingPassword ? 'Sending…' : 'Forgot Password'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance */}
        <TabsContent value="appearance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Theme</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Color Scheme</Label>
                <Select value={theme || 'system'} onValueChange={(val) => setTheme(val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">Auto (System)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team */}
        <TabsContent value="team" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Team Members</CardTitle>
              <Button size="sm" onClick={() => setInviteOpen((prev) => !prev)}>
                {inviteOpen ? 'Cancel' : 'Invite Team Member'}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {inviteOpen && (
                <div className="grid gap-3 rounded-lg border p-4">
                  <div className="grid gap-2">
                    <Label>Email</Label>
                    <Input placeholder="manager@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Full Name</Label>
                    <Input placeholder="Full name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Password</Label>
                    <Input
                      type="password"
                      placeholder="Minimum 8 characters"
                      value={invitePassword}
                      onChange={(e) => setInvitePassword(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Confirm Password</Label>
                    <Input
                      type="password"
                      placeholder="Re-enter password"
                      value={inviteConfirmPassword}
                      onChange={(e) => setInviteConfirmPassword(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Role</Label>
                    <Select
                      value={inviteRole}
                      onValueChange={(val) => {
                        setInviteRole(val as 'manager' | 'caretaker')
                        if (val !== 'caretaker') {
                          setInvitePropertyId('')
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="caretaker">Caretaker</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {inviteRole === 'caretaker' && (
                    <div className="grid gap-2">
                      <Label>Property (scope)</Label>
                      <Select
                        value={invitePropertyId}
                        onValueChange={setInvitePropertyId}
                        disabled={propertiesLoading || properties.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={propertiesLoading ? 'Loading properties...' : 'Select property'} />
                        </SelectTrigger>
                        <SelectContent>
                          {properties.map((property) => (
                            <SelectItem key={property.id} value={property.id}>
                              {property.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {propertiesError && (
                        <p className="text-xs text-destructive">
                          {propertiesError}
                        </p>
                      )}
                      {properties.length === 0 && !propertiesLoading && (
                        <p className="text-xs text-muted-foreground">
                          No properties found in this organization.
                        </p>
                      )}
                    </div>
                  )}
                  <Button className="w-full" onClick={handleInvite} disabled={inviteSaving}>
                    {inviteSaving ? 'Sending…' : 'Send Invite'}
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                {teamMembers.length === 0 && <p className="text-sm text-muted-foreground">No team members yet.</p>}
                {teamMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-semibold">{member.full_name || member.email || 'Unnamed'}</p>
                      <p className="text-sm text-muted-foreground">{member.email || 'No email'}</p>
                      {member.property_name && (
                        <p className="text-xs text-muted-foreground">
                          Property: {member.property_name}
                          {member.property_location ? ` • ${member.property_location}` : ''}
                        </p>
                      )}
                    </div>
                    <Badge variant="secondary" className="capitalize">
                      {member.role}
                    </Badge>
                  </div>
                ))}
                {teamError && <p className="text-sm text-destructive">{teamError}</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
