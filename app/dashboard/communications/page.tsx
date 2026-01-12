'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { SkeletonLoader, SkeletonTable } from '@/components/ui/skeletons'
import { SuccessStateCard } from '@/components/ui/success-state-card'
import { renderTemplateContent } from '@/lib/sms/templateRenderer'
import type { TemplatePlaceholder, TemplateKey } from '@/lib/sms/templateMetadata'
import { useAuth } from '@/lib/auth/context'

type SmsTemplate = {
  key: string
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

type ScheduledReminderRow = {
  key: TemplateKey
  name: string
  cadence: string
  next_scheduled_for: string | null
  last_sent_at: string | null
  status: 'active' | 'inactive'
  pending_count: number
  last_status?: string | null
  last_error?: string | null
}

type CronRunRow = {
  id: string
  function_name: string
  started_at: string
  finished_at: string | null
  ok: boolean | null
  error: string | null
  inserted_count: number
  attempted_count: number
  skipped_prepaid: number
  leases_processed: number
  months_considered: number
  catch_up: boolean
}

type SmsDeliveryRow = {
  id: string
  tenant_name: string
  tenant_phone: string | null
  reminder_type: string | null
  stage: number | null
  delivery_status: string | null
  scheduled_for: string | null
  sent_at: string | null
  last_error: string | null
  message: string | null
  created_at: string | null
}

type SmsTestTarget = {
  building_id: string
  building_name: string
  unit_id: string
  unit_number: string
  tenant_user_id: string
  tenant_name: string
  tenant_phone: string | null
}

export default function CommunicationsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { user } = useAuth()
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
  const [confirmSendOpen, setConfirmSendOpen] = useState(false)
  const [confirmMessage, setConfirmMessage] = useState('')
  const [confirmPhone, setConfirmPhone] = useState('')
  const [testTargets, setTestTargets] = useState<SmsTestTarget[]>([])
  const [targetsLoading, setTargetsLoading] = useState(false)
  const [selectedBuildingId, setSelectedBuildingId] = useState('')
  const [selectedUnitId, setSelectedUnitId] = useState('')
  const [selectedTenantId, setSelectedTenantId] = useState('')
  const [scheduledReminders, setScheduledReminders] = useState<ScheduledReminderRow[]>([])
  const [scheduledLoading, setScheduledLoading] = useState(false)
  const [scheduledError, setScheduledError] = useState<string | null>(null)
  const [cronRuns, setCronRuns] = useState<CronRunRow[]>([])
  const [cronLoading, setCronLoading] = useState(false)
  const [cronError, setCronError] = useState<string | null>(null)
  const [smsDeliveries, setSmsDeliveries] = useState<SmsDeliveryRow[]>([])
  const [smsDeliveriesLoading, setSmsDeliveriesLoading] = useState(false)
  const [smsDeliveriesError, setSmsDeliveriesError] = useState<string | null>(null)
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
  const [announcementHistory, setAnnouncementHistory] = useState<Array<{ id: string; message_text: string; created_at: string | null }>>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [inbox, setInbox] = useState<InboxItem[]>([])
  const [inboxLoading, setInboxLoading] = useState(false)
  const [inboxError, setInboxError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const allPropertiesSelected = selectedProperties.length === 0
  const role = (user?.user_metadata as any)?.role || (user as any)?.role || null
  const isCaretaker = role === 'caretaker'

  const fetchTemplates = async () => {
    try {
      setTemplatesLoading(true)
      setTemplatesError(null)
      const response = await fetch('/api/communications/sms-templates', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load templates.')
      }
      setSmsTemplates(payload.templates || [])
    } catch (error) {
      setTemplatesError(
        error instanceof Error ? error.message : 'Unable to load SMS templates right now.'
      )
    } finally {
      setTemplatesLoading(false)
    }
  }

  const fetchScheduledReminders = async () => {
    try {
      setScheduledLoading(true)
      setScheduledError(null)
      const response = await fetch('/api/communications/scheduled-reminders', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load scheduled reminders.')
      }
      setScheduledReminders(payload.reminders || [])
    } catch (error) {
      setScheduledError(
        error instanceof Error ? error.message : 'Unable to load scheduled reminders right now.'
      )
    } finally {
      setScheduledLoading(false)
    }
  }

  const fetchCronRuns = async () => {
    try {
      setCronLoading(true)
      setCronError(null)
      const response = await fetch('/api/communications/cron-runs?type=sms', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load cron runs.')
      }
      setCronRuns(payload.runs || [])
    } catch (error) {
      setCronError(error instanceof Error ? error.message : 'Unable to load cron runs right now.')
    } finally {
      setCronLoading(false)
    }
  }

  const fetchSmsDeliveries = async () => {
    try {
      setSmsDeliveriesLoading(true)
      setSmsDeliveriesError(null)
      const response = await fetch('/api/communications/sms-deliveries', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load SMS deliveries.')
      }
      setSmsDeliveries(payload.deliveries || [])
    } catch (error) {
      setSmsDeliveriesError(
        error instanceof Error ? error.message : 'Unable to load SMS deliveries right now.'
      )
    } finally {
      setSmsDeliveriesLoading(false)
    }
  }

  const fetchTestTargets = async () => {
    try {
      setTargetsLoading(true)
      const response = await fetch('/api/communications/sms-test-targets', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load tenants.')
      }
      setTestTargets(payload.targets || [])
    } catch (error) {
      console.error('[Communications] Failed to load SMS test targets', error)
    } finally {
      setTargetsLoading(false)
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
    if (!isCaretaker) {
      fetchTemplates()
      fetchProperties()
      fetchAnnouncementHistory()
      fetchScheduledReminders()
      fetchCronRuns()
      fetchSmsDeliveries()
    }
    fetchInbox()
  }, [isCaretaker])

  const fetchAnnouncementHistory = async () => {
    try {
      setHistoryLoading(true)
      const response = await fetch('/api/communications/announcements', { cache: 'no-store' })
      const payload = await response.json()
      if (response.ok) {
        setAnnouncementHistory(Array.isArray(payload.data) ? payload.data : [])
      }
    } catch (error) {
      console.error('[Communications] Failed to load announcement history', error)
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return
    try {
      setSavingTemplate(true)
      const response = await fetch(
        `/api/communications/sms-templates/${encodeURIComponent(editingTemplate.key)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: editContent,
            name: editingTemplate.name,
            description: editingTemplate.description,
          }),
        }
      )
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
    setSelectedBuildingId('')
    setSelectedUnitId('')
    setSelectedTenantId('')
    fetchTestTargets()
  }

  const handleSendTest = async () => {
    if (!testTemplate || !confirmPhone) {
      toast({
        title: 'Missing information',
        description: 'Enter a phone number to send a test SMS.',
        variant: 'destructive',
      })
      return
    }
    try {
      setSendingTest(true)
      const preview = confirmMessage || renderTemplateContent(testTemplate.content, testValues)
      const response = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: confirmPhone,
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
      setConfirmSendOpen(false)
    }
  }

  const handleTestPreview = () => {
    if (!testTemplate) return
    if (!testPhone) {
      toast({
        title: 'Missing information',
        description: 'Enter a phone number to send a test SMS.',
        variant: 'destructive',
      })
      return
    }
    const preview = renderTemplateContent(testTemplate.content, testValues)
    setConfirmMessage(preview)
    setConfirmPhone(testPhone)
    setConfirmSendOpen(true)
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
      fetchAnnouncementHistory()
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

  const formatDateTime = (value: string | null) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleString()
  }

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start) return '—'
    if (!end) return 'Running'
    const startMs = new Date(start).getTime()
    const endMs = new Date(end).getTime()
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return '—'
    const diff = Math.max(0, endMs - startMs)
    if (diff < 1000) return `${diff}ms`
    if (diff < 60000) return `${(diff / 1000).toFixed(1)}s`
    return `${(diff / 60000).toFixed(1)}m`
  }

  const statusBadgeClass = (status: string | null | undefined) => {
    switch (status) {
      case 'sent':
        return 'bg-emerald-600 text-white'
      case 'failed':
        return 'bg-rose-600 text-white'
      case 'processing':
        return 'bg-blue-600 text-white'
      case 'pending':
        return 'bg-amber-500 text-white'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  const buildingOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    testTargets.forEach((target) => {
      if (!map.has(target.building_id)) {
        map.set(target.building_id, { id: target.building_id, name: target.building_name })
      }
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [testTargets])

  const unitOptions = useMemo(() => {
    if (!selectedBuildingId) return []
    const map = new Map<string, { id: string; label: string }>()
    testTargets
      .filter((target) => target.building_id === selectedBuildingId)
      .forEach((target) => {
        if (!map.has(target.unit_id)) {
          map.set(target.unit_id, { id: target.unit_id, label: target.unit_number })
        }
      })
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [testTargets, selectedBuildingId])

  const tenantOptions = useMemo(() => {
    if (!selectedBuildingId || !selectedUnitId) return []
    return testTargets
      .filter(
        (target) =>
          target.building_id === selectedBuildingId && target.unit_id === selectedUnitId
      )
      .sort((a, b) => a.tenant_name.localeCompare(b.tenant_name))
  }, [testTargets, selectedBuildingId, selectedUnitId])

  const selectedTarget = useMemo(() => {
    if (!selectedTenantId) return null
    return testTargets.find(
      (target) =>
        target.tenant_user_id === selectedTenantId &&
        target.unit_id === selectedUnitId &&
        target.building_id === selectedBuildingId
    )
  }, [testTargets, selectedTenantId, selectedUnitId, selectedBuildingId])

  const applyTargetToTestValues = useCallback((target: SmsTestTarget | null) => {
    if (!target) return
    const unitLabel = target.unit_number && target.building_name
      ? `${target.unit_number} · ${target.building_name}`
      : target.unit_number || target.building_name || ''

    setTestPhone(target.tenant_phone || '')
    setTestValues((current) => ({
      ...current,
      '{{tenant_name}}': target.tenant_name || current['{{tenant_name}}'] || 'Tenant',
      '{{unit_label}}': unitLabel || current['{{unit_label}}'] || '',
      '[TENANT_NAME]': target.tenant_name || current['[TENANT_NAME]'] || 'Tenant',
      '[UNIT_NUMBER]': target.unit_number || current['[UNIT_NUMBER]'] || '',
      '[PROPERTY_NAME]': target.building_name || current['[PROPERTY_NAME]'] || '',
    }))
  }, [])

  const templatesMemo = useMemo(() => smsTemplates, [smsTemplates])

  const announcementSuccessDetails = useMemo(() => {
    if (!announcementResult) return []
    const details = [{ label: 'Recipients', value: String(announcementResult.recipients || 0) }]
    if (announcementResult.sms_sent !== undefined) {
      details.push({ label: 'SMS sent', value: String(announcementResult.sms_sent || 0) })
    }
    if (announcementResult.sms_failed) {
      details.push({ label: 'SMS failed', value: String(announcementResult.sms_failed) })
    }
    return details
  }, [announcementResult])

  useEffect(() => {
    if (selectedTarget) {
      applyTargetToTestValues(selectedTarget)
    }
  }, [selectedTarget, applyTargetToTestValues])

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
            <SuccessStateCard
              title="Announcement sent successfully"
              description="Your announcement has been delivered to the selected tenants."
              badge="Announcement sent"
              details={announcementSuccessDetails}
              onBack={resetAnnouncementForm}
              actions={<Button onClick={resetAnnouncementForm}>Send another one</Button>}
            />
          ) : (
            <>
          <div className="mb-6">
            <h1 className="text-3xl font-bold">Communications Hub</h1>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className={`grid w-full ${isCaretaker ? 'grid-cols-1' : 'grid-cols-3'}`}>
            <TabsTrigger value="messages">Messages</TabsTrigger>
            {!isCaretaker && <TabsTrigger value="sms">SMS Reminders</TabsTrigger>}
            {!isCaretaker && <TabsTrigger value="announcements">Announcements</TabsTrigger>}
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
                    <div className="border rounded-lg overflow-hidden shadow-sm bg-white">
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
                          <TableCell colSpan={4} className="py-6">
                            <SkeletonTable rows={3} columns={4} />
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
          {!isCaretaker && (
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
                  <CardContent className="space-y-3">
                    <SkeletonLoader height={16} width="60%" />
                    <SkeletonLoader height={12} width="80%" />
                    <SkeletonLoader height={12} width="50%" />
                    <SkeletonLoader height={14} width="70%" />
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
                        <TableHead>Next Run</TableHead>
                        <TableHead>Last Sent</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Status</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scheduledLoading ? (
                        <TableRow>
                          <TableCell colSpan={7} className="py-6">
                            <SkeletonTable rows={3} columns={4} />
                          </TableCell>
                        </TableRow>
                      ) : scheduledError ? (
                        <TableRow>
                          <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                            {scheduledError}
                          </TableCell>
                        </TableRow>
                      ) : scheduledReminders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                            No scheduled reminders found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        scheduledReminders.map((reminder) => (
                          <TableRow key={reminder.key}>
                            <TableCell className="font-medium">{reminder.name}</TableCell>
                            <TableCell>{reminder.cadence}</TableCell>
                            <TableCell>{formatDateTime(reminder.next_scheduled_for)}</TableCell>
                            <TableCell>{formatDateTime(reminder.last_sent_at)}</TableCell>
                            <TableCell>
                              <Badge
                                className={
                                  reminder.status === 'active'
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-muted text-muted-foreground'
                                }
                              >
                                {reminder.status === 'active' ? 'Active' : 'Inactive'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={statusBadgeClass(reminder.last_status || 'pending')}>
                                {reminder.last_status || '—'}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[220px]">
                              {reminder.last_error ? (
                                <span
                                  className="block truncate text-xs text-rose-600"
                                  title={reminder.last_error}
                                >
                                  {reminder.last_error}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Cron Runs</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Latest SMS/reminder worker runs recorded in cron_runs.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Function</TableHead>
                          <TableHead>Started</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cronLoading ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-6">
                              <SkeletonTable rows={3} columns={4} />
                            </TableCell>
                          </TableRow>
                        ) : cronError ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                              {cronError}
                            </TableCell>
                          </TableRow>
                        ) : cronRuns.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                              No cron runs recorded yet.
                            </TableCell>
                          </TableRow>
                        ) : (
                          cronRuns.map((run) => (
                            <TableRow key={run.id}>
                              <TableCell className="font-medium">{run.function_name}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {formatDateTime(run.started_at)}
                              </TableCell>
                              <TableCell className="text-xs">{formatDuration(run.started_at, run.finished_at)}</TableCell>
                              <TableCell>
                                <Badge
                                  className={
                                    run.ok === true
                                      ? 'bg-emerald-600 text-white'
                                      : run.ok === false
                                      ? 'bg-rose-600 text-white'
                                      : 'bg-amber-500 text-white'
                                  }
                                >
                                  {run.ok === true ? 'Success' : run.ok === false ? 'Failed' : 'Running'}
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-[180px]">
                                {run.error ? (
                                  <span className="block truncate text-xs text-rose-600" title={run.error}>
                                    {run.error}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent SMS Deliveries</CardTitle>
                  <p className="text-xs text-muted-foreground">Most recent SMS reminder sends and statuses.</p>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tenant</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Scheduled</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {smsDeliveriesLoading ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-6">
                              <SkeletonTable rows={3} columns={4} />
                            </TableCell>
                          </TableRow>
                        ) : smsDeliveriesError ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                              {smsDeliveriesError}
                            </TableCell>
                          </TableRow>
                        ) : smsDeliveries.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                              No SMS deliveries recorded yet.
                            </TableCell>
                          </TableRow>
                        ) : (
                          smsDeliveries.map((delivery) => (
                            <TableRow key={delivery.id}>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="font-medium">{delivery.tenant_name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {delivery.tenant_phone || '—'}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {delivery.reminder_type || 'sms'}
                                {delivery.stage ? ` • Stage ${delivery.stage}` : ''}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {formatDateTime(delivery.scheduled_for)}
                              </TableCell>
                              <TableCell>
                                <Badge className={statusBadgeClass(delivery.delivery_status)}>
                                  {delivery.delivery_status || '—'}
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-[200px]">
                                {delivery.last_error ? (
                                  <span
                                    className="block truncate text-xs text-rose-600"
                                    title={delivery.last_error}
                                  >
                                    {delivery.last_error}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          )}

          {/* Announcements Tab */}
          {!isCaretaker && (
          <TabsContent value="announcements" className="space-y-4">
            <Card className="shadow-lg">
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
                    <div className="space-y-2">
                      <SkeletonLoader height={14} width="50%" />
                      <SkeletonLoader height={14} width="60%" />
                      <SkeletonLoader height={14} width="40%" />
                    </div>
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
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle>Announcement History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {historyLoading ? (
                      <SkeletonTable rows={4} columns={3} />
                    ) : announcementHistory.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No announcements yet.</p>
                    ) : (
                      <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                        {announcementHistory.map((item) => (
                          <div key={item.id} className="p-3 border rounded-lg bg-muted/30">
                            <p className="text-sm font-medium line-clamp-2">{item.message_text}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
          </TabsContent>
          )}
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
                <Input placeholder="RES" />
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
                {"Update the SMS text. Keep placeholder tokens exactly as shown (e.g. {{amount}} or [AMOUNT])."}
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
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Send test SMS</DialogTitle>
              <DialogDescription>
                Fill in placeholder values and a phone number to receive a preview of this template.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-3">
                <Label>Choose a tenant (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  Selecting a tenant will auto-fill phone and template variables.
                </p>
                {targetsLoading ? (
                  <div className="space-y-2">
                    <SkeletonLoader height={12} width="60%" />
                    <SkeletonLoader height={12} width="40%" />
                  </div>
                ) : testTargets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No active tenants found for this organization.
                  </p>
                ) : (
                  <div className="grid gap-3">
                    <div>
                      <Label className="text-xs">Apartment building</Label>
                      <Select
                        value={selectedBuildingId}
                        onValueChange={(value) => {
                          setSelectedBuildingId(value)
                          setSelectedUnitId('')
                          setSelectedTenantId('')
                          setTestPhone('')
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a building" />
                        </SelectTrigger>
                        <SelectContent>
                          {buildingOptions.map((building) => (
                            <SelectItem key={building.id} value={building.id}>
                              {building.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Unit</Label>
                      <Select
                        value={selectedUnitId}
                        onValueChange={(value) => {
                          setSelectedUnitId(value)
                          setSelectedTenantId('')
                          setTestPhone('')
                        }}
                      >
                        <SelectTrigger disabled={!selectedBuildingId}>
                          <SelectValue placeholder="Select a unit" />
                        </SelectTrigger>
                        <SelectContent>
                          {unitOptions.map((unit) => (
                            <SelectItem key={unit.id} value={unit.id}>
                              {unit.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Tenant</Label>
                      <Select
                        value={selectedTenantId}
                        onValueChange={(value) => setSelectedTenantId(value)}
                      >
                        <SelectTrigger disabled={!selectedUnitId}>
                          <SelectValue placeholder="Select a tenant" />
                        </SelectTrigger>
                        <SelectContent>
                          {tenantOptions.map((tenant) => (
                            <SelectItem key={tenant.tenant_user_id} value={tenant.tenant_user_id}>
                              {tenant.tenant_name} · {tenant.unit_number}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
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
              <Button onClick={handleTestPreview} disabled={sendingTest}>
                {sendingTest ? 'Sending…' : 'Send test SMS'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
          <AlertDialogContent className="max-w-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm test send</AlertDialogTitle>
              <AlertDialogDescription>
                Review the message preview and confirm sending to the selected phone number.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-xs uppercase text-muted-foreground">Send to</p>
                <p className="text-sm font-medium">{confirmPhone || '—'}</p>
              </div>
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-xs uppercase text-muted-foreground">Message preview</p>
                <p className="text-sm whitespace-pre-line">{confirmMessage || '—'}</p>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={sendingTest}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleSendTest} disabled={sendingTest}>
                {sendingTest ? 'Sending…' : 'Send test SMS'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </main>
      </div>
    </div>
  )
}
