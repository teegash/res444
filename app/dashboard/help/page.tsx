'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

export default function HelpSupportPage() {
  const router = useRouter()
  const supportEmail = 'info@natibasolutions.com'
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const { toast } = useToast()

  const sendSupport = async () => {
    if (!subject || !message) {
      toast({ title: 'Missing details', description: 'Subject and message are required.', variant: 'destructive' })
      return
    }
    try {
      setSending(true)
      const res = await fetch('/api/support/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to send support request.')
      }
      toast({ title: 'Sent', description: 'Your message has been sent to support.' })
      setSubject('')
      setMessage('')
    } catch (err) {
      toast({
        title: 'Send failed',
        description: err instanceof Error ? err.message : 'Unable to send support request.',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Help & Support</h1>
        <Button variant="ghost" size="icon" aria-label="Back" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contact Support</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Email</Label>
            <Input value={supportEmail} disabled />
          </div>
          <div className="grid gap-2">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="How can we help?" />
          </div>
          <div className="grid gap-2">
            <Label>Message</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} />
          </div>
          <div className="flex justify-end">
            <Button onClick={sendSupport} disabled={!subject || !message || sending}>
              {sending ? 'Sending…' : 'Send to Support'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            We’ll reply within 1 business day. For urgent issues, include your phone number.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick Links</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border p-4">
            <p className="font-semibold">Knowledge Base</p>
            <p className="text-sm text-muted-foreground">Guides on payments, leases, reporting, and maintenance.</p>
            <Button variant="link" className="px-0" onClick={() => window.open('https://support.res.com', '_blank')}>
              Open knowledge base
            </Button>
          </div>
          <div className="rounded-lg border p-4">
            <p className="font-semibold">System Status</p>
            <p className="text-sm text-muted-foreground">Check if there are ongoing outages.</p>
            <Button variant="link" className="px-0" onClick={() => window.open('https://status.res.com', '_blank')}>
              View status
            </Button>
          </div>
          <div className="rounded-lg border p-4">
            <p className="font-semibold">Report a Bug</p>
            <p className="text-sm text-muted-foreground">Tell us what’s broken with steps to reproduce.</p>
            <Button variant="link" className="px-0" onClick={() => setSubject('Bug Report')}>
              Start a bug report
            </Button>
          </div>
          <div className="rounded-lg border p-4">
            <p className="font-semibold">Feature Request</p>
            <p className="text-sm text-muted-foreground">Suggest improvements to help your team.</p>
            <Button variant="link" className="px-0" onClick={() => setSubject('Feature Request')}>
              Share a feature idea
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
