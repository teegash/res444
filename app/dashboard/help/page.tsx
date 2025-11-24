'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useState } from 'react'

export default function HelpSupportPage() {
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  const openMail = () => {
    const mailto = `mailto:support@rentalkenya.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
      message + `\n\nFrom: ${email}`
    )}`
    window.location.href = mailto
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Help & Support</h1>

      <Card>
        <CardHeader>
          <CardTitle>Contact Support</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
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
            <Button onClick={openMail} disabled={!email || !subject || !message}>
              Send to Support
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
            <Button variant="link" className="px-0" onClick={() => window.open('https://support.rentalkenya.com', '_blank')}>
              Open knowledge base
            </Button>
          </div>
          <div className="rounded-lg border p-4">
            <p className="font-semibold">System Status</p>
            <p className="text-sm text-muted-foreground">Check if there are ongoing outages.</p>
            <Button variant="link" className="px-0" onClick={() => window.open('https://status.rentalkenya.com', '_blank')}>
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
