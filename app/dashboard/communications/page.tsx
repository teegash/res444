'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { MessageSquare, Send, SettingsIcon, Bell } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { useToast } from '@/components/ui/use-toast'
import { renderTemplateContent } from '@/lib/sms/templateRenderer'
import type { TemplatePlaceholder, TemplateKey } from '@/lib/sms/templateMetadata'

type SmsTemplate = {
  key: TemplateKey
  name: string
  description: string
  content: string
  placeholders: TemplatePlaceholder[]
}

type PropertySummary = {
  id: string
  name: string
  location: string
  totalUnits: number
  occupiedUnits: number
}

export default function CommunicationsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState('messages')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [smsTemplates, setSmsTemplates] = useState<SmsTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<SmsTemplate | null>(null)
  const [editContent, setEditContent] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [testTemplate, setTestTemplate] = useState<SmsTemplate | null>(null)
  const [testPhone, setTestPhone] = useState('')
  const [testValues, setTestValues] = useState<Record<string, string>>({})
  const [sendingTest, setSendingTest] = useState(false)
  const [properties, setProperties] = useState<PropertySummary[]>([])
  const [selectedProperties, setSelectedProperties] = useState<string[]>([])
  const [propertiesLoading, setPropertiesLoading] = useState(false)
  const [announcementSending, setAnnouncementSending] = useState(false)

  const messages = [
    { id: 1, tenant: 'John Doe', message: 'Payment received for Unit 101', date: '2024-11-10', type: 'info' },
    { id: 2, tenant: 'Jane Smith', message: 'Maintenance scheduled for tomorrow', date: '2024-11-09', type: 'alert' },
  ]

  const fetchTemplates = async () => {
    try {
      setTemplatesLoading(true)
      setTemplatesError(null)
      const response = await fetch('/api/sms/templates', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load templates.')
      }
      setSmsTemplates(payload.data || [])
    } catch (error) {
      setTemplatesError(
        error instanceof Error ? error.message : 'Unable to load SMS templates right now.'
      )
    } finally {
      setTemplatesLoading(false)
    }
  }

  const fetchProperties = async () => {
    try {
      setPropertiesLoading(true)
      const response = await fetch('/api/properties', { cache: 'no-store' })
      const payload = await response.json()
      if (response.ok) {
        setProperties(payload.data || [])
      }
    } catch (error) {
      console.error('[Communications] Failed to load properties', error)
    } finally {
      setPropertiesLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
    fetchProperties()
  }, [])

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return
    try {
      setSavingTemplate(true)
      const response = await fetch('/api/sms/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templates: [
            {
              key: editingTemplate.key,
              content: editContent,
              name: editingTemplate.name,
              description: editingTemplate.description,
            },
          ],
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save template.')
      }
      setSmsTemplates((current) =>
        current.map((template) =>
          template.key === editingTemplate.key ? { ...template, content: editContent } : template
        )
      )
      toast({ title: 'Template updated' })
      setEditingTemplate(null)
    } catch (error) {
      toast({
        title: 'Unable to save template',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      })
    } finally {
      setSavingTemplate(false)
    }
  }

  const openTestDialog = (template: SmsTemplate) => {
    setTestTemplate(template)
    const initialValues: Record<string, string> = {}
    template.placeholders.forEach((placeholder) => {
      initialValues[placeholder.token] = placeholder.sample || ''
    })
    setTestValues(initialValues)
    setTestPhone('')
  }

  const handleSendTest = async () => {
    if (!testTemplate || !testPhone) {
      toast({
        title: 'Missing information',
        description: 'Enter a phone number to send a test SMS.',
        variant: 'destructive',
      })
      return
    }
    try {
      setSendingTest(true)
      const preview = renderTemplateContent(testTemplate.content, testValues)
      const response = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: testPhone,
          message: preview,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to send test SMS.')
      }
      toast({ title: 'Test SMS sent' })
      setTestTemplate(null)
    } catch (error) {
      toast({
        title: 'Test send failed',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      })
    } finally {
      setSendingTest(false)
    }
  }

  const togglePropertySelection = (propertyId: string, checked: boolean) => {
    setSelectedProperties((current) => {
      if (checked) {
        return current.includes(propertyId) ? current : [...current, propertyId]
      }
      return current.filter((id) => id !== propertyId)
    })
  }

  const handleSendAnnouncement = async () => {
    if (!newMessage.trim()) {
      toast({
        title: 'Message required',
        description: 'Enter an announcement before sending.',
        variant: 'destructive',
      })
      return
    }

    try {
      setAnnouncementSending(true)
      const response = await fetch('/api/communications/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: newMessage.trim(),
          building_ids: selectedProperties,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to send announcement.')
      }
      toast({
        title: 'Announcement sent',
        description: `${payload.data?.recipients || 0} tenants notified.`,
      })
      setNewMessage('')
    } catch (error) {
      toast({
        title: 'Unable to send announcement',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      })
    } finally {
      setAnnouncementSending(false)
    }
  }

  const templatesMemo = useMemo(() => smsTemplates, [smsTemplates])

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-8 overflow-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold">Communications Hub</h1>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="sms">SMS Reminders</TabsTrigger>
            <TabsTrigger value="announcements">Announcements</TabsTrigger>
          </TabsList>

          {/* Messages Tab */}
          <TabsContent value="messages" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Message Inbox</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>From</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {messages.map((msg) => (
                        <TableRow key={msg.id}>
                          <TableCell className="font-medium">{msg.tenant}</TableCell>
                          <TableCell>{msg.message}</TableCell>
                          <TableCell className="text-sm">{msg.date}</TableCell>
                          <TableCell>
                            <Badge variant={msg.type === 'info' ? 'default' : 'secondary'}>
                              {msg.type}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SMS Reminders Tab */}
          <TabsContent value="sms" className="space-y-4">
            <div className="flex justify-end mb-4">
              <Button onClick={() => setSettingsOpen(true)} className="gap-2">
                <SettingsIcon className="w-4 h-4" />
                Configure Settings
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templatesLoading ? (
                <Card>
                  <CardContent className="py-10 text-center text-muted-foreground">
                    Loading templates…
                  </CardContent>
                </Card>
              ) : templatesError ? (
                <Card>
                  <CardContent className="py-10 text-center text-muted-foreground">
                    {templatesError}
                  </CardContent>
                </Card>
              ) : (
                templatesMemo.map((template) => (
                  <Card key={template.key}>
                    <CardHeader>
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{template.description}</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground whitespace-pre-line">{template.content}</p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => openTestDialog(template)}
                        >
                          Test Send
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            setEditingTemplate(template)
                            setEditContent(template.content)
                          }}
                        >
                          Edit
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {/* Scheduled Reminders */}
            <Card>
              <CardHeader>
                <CardTitle>Scheduled Reminders</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reminder Type</TableHead>
                        <TableHead>Frequency</TableHead>
                        <TableHead>Last Sent</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>Rent Payment</TableCell>
                        <TableCell>Monthly</TableCell>
                        <TableCell>2024-11-01</TableCell>
                        <TableCell><Badge className="bg-green-600">Active</Badge></TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Water Bill</TableCell>
                        <TableCell>Monthly</TableCell>
                        <TableCell>2024-11-05</TableCell>
                        <TableCell><Badge className="bg-green-600">Active</Badge></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Announcements Tab */}
          <TabsContent value="announcements" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Emergency Announcements</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="announcement">Message</Label>
                  <Textarea
                    id="announcement"
                    placeholder="Type your announcement here..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="h-32"
                  />
                </div>
                <div className="space-y-3">
                  <Label>Target properties</Label>
                  {propertiesLoading ? (
                    <p className="text-sm text-muted-foreground">Loading properties…</p>
                  ) : (
                    <div className="grid gap-3 border rounded-lg p-3 max-h-56 overflow-y-auto">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="all-properties"
                          checked={selectedProperties.length === 0}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedProperties([])
                            }
                          }}
                        />
                        <Label htmlFor="all-properties" className="text-sm">
                          All properties
                        </Label>
                      </div>
                      {properties.map((property) => (
                        <div key={property.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`property-${property.id}`}
                            checked={
                              selectedProperties.length === 0
                                ? true
                                : selectedProperties.includes(property.id)
                            }
                            onCheckedChange={(checked) => {
                              togglePropertySelection(property.id, Boolean(checked))
                            }}
                          />
                          <div className="flex-1">
                            <Label htmlFor={`property-${property.id}`} className="text-sm">
                              {property.name}
                            </Label>
                            <p className="text-xs text-muted-foreground">{property.location}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Button className="gap-2" onClick={handleSendAnnouncement} disabled={announcementSending}>
                  {announcementSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Send announcement
                </Button>
              </CardContent>
            </Card>

            {/* Past Announcements */}
            <Card>
              <CardHeader>
                <CardTitle>Announcement History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg">
                    <p className="font-medium">Water Maintenance Notice</p>
                    <p className="text-sm text-muted-foreground">Sent on 2024-11-08 to all tenants</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Settings Modal */}
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>SMS Configuration</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>SMS Provider</Label>
                <Select defaultValue="africastalking">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="africastalking">Africa's Talking</SelectItem>
                    <SelectItem value="nexmo">Nexmo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>API Key</Label>
                <Input type="password" placeholder="Enter your API key" />
              </div>
              <div>
                <Label>Sender ID</Label>
                <Input placeholder="RentalKenya" />
              </div>
              <Button>Save Settings</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit template dialog */}
        <Dialog open={!!editingTemplate} onOpenChange={(open) => (!open ? setEditingTemplate(null) : null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit template</DialogTitle>
              <DialogDescription>
                Update the SMS text. Keep placeholder tokens exactly as shown (e.g. [AMOUNT]).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm font-medium">{editingTemplate?.name}</p>
              <Textarea
                value={editContent}
                onChange={(event) => setEditContent(event.target.value)}
                rows={6}
              />
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Placeholders</p>
                <div className="grid gap-2">
                  {editingTemplate?.placeholders.map((placeholder) => (
                    <div key={placeholder.token} className="text-xs text-muted-foreground">
                      <span className="font-semibold">{placeholder.token}</span> &ndash;{' '}
                      {placeholder.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingTemplate(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveTemplate} disabled={savingTemplate}>
                {savingTemplate ? 'Saving…' : 'Save template'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Test send dialog */}
        <Dialog open={!!testTemplate} onOpenChange={(open) => (!open ? setTestTemplate(null) : null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Send test SMS</DialogTitle>
              <DialogDescription>
                Fill in placeholder values and a phone number to receive a preview of this template.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Phone number</Label>
                <Input value={testPhone} onChange={(event) => setTestPhone(event.target.value)} />
              </div>
              <div className="grid gap-3">
                {testTemplate?.placeholders.map((placeholder) => (
                  <div key={placeholder.token}>
                    <Label>{placeholder.label}</Label>
                    <Input
                      value={testValues[placeholder.token] || ''}
                      onChange={(event) =>
                        setTestValues((current) => ({
                          ...current,
                          [placeholder.token]: event.target.value,
                        }))
                      }
                      placeholder={placeholder.sample}
                    />
                  </div>
                ))}
              </div>
              {testTemplate ? (
                <div className="border rounded-md p-3 bg-muted/40">
                  <p className="text-xs uppercase text-muted-foreground">Preview</p>
                  <p className="text-sm whitespace-pre-line">
                    {renderTemplateContent(testTemplate.content, testValues)}
                  </p>
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTestTemplate(null)}>
                Cancel
              </Button>
              <Button onClick={handleSendTest} disabled={sendingTest}>
                {sendingTest ? 'Sending…' : 'Send test SMS'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </main>
      </div>
    </div>
  )
}
