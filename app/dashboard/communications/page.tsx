'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Send, SettingsIcon, Loader2 } from 'lucide-react'
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

type InboxItem = {
  tenantId: string
  tenantName: string
  lastMessage: string
  lastCreatedAt: string | null
  unreadCount: number
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
  const [announcementResult, setAnnouncementResult] = useState<{
    recipients: number
    sms_sent?: number
    sms_failed?: number
  } | null>(null)
  const [sendSms, setSendSms] = useState(false)
  const [inbox, setInbox] = useState<InboxItem[]>([])
  const [inboxLoading, setInboxLoading] = useState(false)
  const [inboxError, setInboxError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const allPropertiesSelected = selectedProperties.length === 0

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

  const fetchInbox = async () => {
    try {
      setInboxLoading(true)
      setInboxError(null)
      const response = await fetch('/api/communications/messages', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load messages.')
      }
      setInbox(Array.isArray(payload.data) ? payload.data : [])
    } catch (error) {
      setInboxError(
        error instanceof Error ? error.message : 'Unable to load messages right now.'
      )
    } finally {
      setInboxLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
    fetchProperties()
    fetchInbox()
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
        if (current.length === 0) {
          return [propertyId]
        }
        return current.includes(propertyId) ? current : [...current, propertyId]
      }
      if (current.length === 0) {
        return properties.filter((property) => property.id !== propertyId).map((p) => p.id)
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
          send_sms: sendSms,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to send announcement.')
      }
      setAnnouncementResult(payload.data || { recipients: 0 })
      setActiveTab('announcements')
      setNewMessage('')
      setSelectedProperties([])
      setSendSms(false)
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

  const filteredInbox = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return inbox
    return inbox.filter((item) => {
      const fields = [item.tenantName, item.lastMessage]
      return fields.some((value) => (value ? value.toLowerCase().includes(term) : false))
    })
  }, [inbox, searchTerm])

  const formatRelative = (value: string | null) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return formatDistanceToNow(date, { addSuffix: true })
  }

  const templatesMemo = useMemo(() => smsTemplates, [smsTemplates])

  const resetAnnouncementForm = () => {
    setAnnouncementResult(null)
    setNewMessage('')
    setSelectedProperties([])
    setSendSms(false)
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-8 overflow-auto">
          {announcementResult ? (
            <div className="max-w-3xl mx-auto py-12">
              <Card className="text-center space-y-4 p-8">
                <CardTitle className="text-2xl">Announcement sent successfully</CardTitle>
                <p className="text-muted-foreground">
                  Delivered to {announcementResult.recipients || 0} tenants
                  {announcementResult.sms_sent !== undefined
                    ? ` • SMS sent: ${announcementResult.sms_sent || 0}${
                        announcementResult.sms_failed
                          ? ` (failed: ${announcementResult.sms_failed})`
                          : ''
                      }`
                    : ''}
                </p>
                <div className="flex justify-center">
                  <Button onClick={resetAnnouncementForm}>Send another one</Button>
                </div>
                <div className="flex justify-center">
                  <Button variant="outline" onClick={resetAnnouncementForm}>
                    Back to announcements
                  </Button>
                </div>
              </Card>
            </div>
          ) : (
            <>
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
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Message Inbox</CardTitle>
                  <p className="text-sm text-muted-foreground">Latest tenant conversations</p>
                </div>
                <div className="flex items-center gap-2 w-full md:w-96">
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search tenant or message"
                  />
                  <Button variant="outline" size="sm" onClick={fetchInbox} disabled={inboxLoading}>
                    {inboxLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tenant</TableHead>
                        <TableHead>Latest message</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inboxLoading ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                            <div className="flex items-center justify-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading inbox…
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : inboxError ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                            {inboxError}
                          </TableCell>
                        </TableRow>
                      ) : filteredInbox.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                            No conversations yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredInbox.map((item) => (
                          <TableRow
                            key={item.tenantId}
                            className="cursor-pointer hover:bg-muted/40"
                            onClick={() =>
                              router.push(`/dashboard/tenants/${item.tenantId}/messages?tenantId=${item.tenantId}`)
                            }
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <span>{item.tenantName}</span>
                                {item.unreadCount > 0 && (
                                  <Badge variant="secondary" className="text-xs">
                                    {item.unreadCount} new
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-xs truncate">{item.lastMessage}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatRelative(item.lastCreatedAt)}
                            </TableCell>
                            <TableCell className="text-xs uppercase text-muted-foreground">
                              Conversation
                            </TableCell>
                          </TableRow>
                        ))
                      )}
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
                  <Label>Target properties (choose apartments)</Label>
                  {propertiesLoading ? (
                    <p className="text-sm text-muted-foreground">Loading properties…</p>
                  ) : (
                    <div className="grid gap-3 border rounded-lg p-3 max-h-56 overflow-y-auto">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="all-properties"
                          checked={allPropertiesSelected}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedProperties([])
                            } else {
                              setSelectedProperties(properties.map((property) => property.id))
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
                            checked={allPropertiesSelected || selectedProperties.includes(property.id)}
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
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="send-sms"
                        checked={sendSms}
                        onCheckedChange={(checked) => setSendSms(Boolean(checked))}
                      />
                      <div className="space-y-1">
                        <Label htmlFor="send-sms" className="text-sm font-medium">
                          Send as SMS too
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Tenants in the selected properties will receive this message via text.
                        </p>
                      </div>
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
            </>
          )}

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
