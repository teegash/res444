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

type TeamMember = {
  id: string
  email: string | null
  full_name: string | null
  role: string
}

export default function SettingsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('account')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [teamError, setTeamError] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteRole, setInviteRole] = useState<'manager' | 'caretaker'>('manager')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteSaving, setInviteSaving] = useState(false)
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
  }, [])

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
              <div>
                <Label>Full Name</Label>
                <Input defaultValue="Maurice Robbins" />
              </div>
              <div>
                <Label>Email</Label>
                <Input defaultValue="maurice@rentalkenya.com" type="email" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input defaultValue="+254712345678" />
              </div>
              <Button>Update Profile</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button variant="outline" className="w-full">Change Password</Button>
              <Button variant="outline" className="w-full">Enable Two-Factor Authentication</Button>
              <Button variant="outline" className="w-full">View Login History</Button>
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
                <Select defaultValue="dark">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="auto">Auto (System)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team */}
        <TabsContent value="team" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">Maurice Robbins</p>
                    <p className="text-sm text-muted-foreground">you@rentalkenya.com</p>
                  </div>
                  <Badge>Admin</Badge>
                </div>
                <Button variant="outline" className="w-full">Invite Team Member</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integrations */}
        <TabsContent value="integrations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Connected Services</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">M-Pesa Integration</p>
                  <p className="text-sm text-muted-foreground">Payment processing</p>
                </div>
                <Badge className="bg-green-600">Connected</Badge>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Africa's Talking SMS</p>
                  <p className="text-sm text-muted-foreground">SMS messaging service</p>
                </div>
                <Badge className="bg-green-600">Connected</Badge>
              </div>
              <Button variant="outline" className="w-full">Add Integration</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
