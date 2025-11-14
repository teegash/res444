'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { CheckCircle2 } from 'lucide-react'

const reminders = [
  {
    id: 1,
    title: 'Rent Payment Reminders',
    status: 'connected',
    frequency: '1st, 5th, 7th of month',
    template: 'Dear tenant, rent payment is due on the 1st. Please pay KES [amount] to avoid penalties.',
    recipients: 'Tenants',
    enabled: true,
  },
  {
    id: 2,
    title: 'Water Bill Reminders',
    status: 'connected',
    frequency: 'Monthly',
    template: 'Water bill for this month is KES [amount]. Please arrange payment with the caretaker.',
    recipients: 'Caretakers',
    enabled: true,
  },
  {
    id: 3,
    title: 'Maintenance Updates',
    status: 'connected',
    frequency: 'On status change',
    template: 'Your maintenance request [ID] has been updated to [status].',
    recipients: 'Tenants',
    enabled: true,
  },
  {
    id: 4,
    title: 'Lease Renewal Alerts',
    status: 'connected',
    frequency: '30, 7, 1 days before',
    template: 'Your lease expires in [days] days. Please contact management for renewal.',
    recipients: 'Tenants',
    enabled: false,
  },
]

const scheduledReminders = [
  { id: 1, recipient: 'John Doe', type: 'Rent Payment', scheduledFor: '2024-03-01', status: 'Pending' },
  { id: 2, recipient: 'Jane Smith', type: 'Water Bill', scheduledFor: '2024-02-05', status: 'Pending' },
  { id: 3, recipient: 'All Tenants', type: 'Rent Payment', scheduledFor: '2024-02-05', status: 'Pending' },
]

export function SMSRemindersTab() {
  const [remindersData, setRemindersData] = useState(reminders)

  const toggleReminder = (id) => {
    setRemindersData(remindersData.map(r =>
      r.id === id ? { ...r, enabled: !r.enabled } : r
    ))
  }

  return (
    <div className="space-y-4">
      <Card className="bg-green-950/20 border-green-500/50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <div>
              <p className="font-semibold">Africa's Talking Connected</p>
              <p className="text-sm text-muted-foreground">Your SMS integration is active and ready to send automated reminders.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {remindersData.map((reminder) => (
          <Card key={reminder.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-lg">{reminder.title}</CardTitle>
                <CardDescription>Sent to: {reminder.recipients}</CardDescription>
              </div>
              <Switch
                checked={reminder.enabled}
                onCheckedChange={() => toggleReminder(reminder.id)}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-semibold">Frequency</p>
                  <p className="text-muted-foreground">{reminder.frequency}</p>
                </div>
                <div>
                  <p className="font-semibold">Status</p>
                  <Badge variant="outline" className="capitalize">{reminder.status}</Badge>
                </div>
              </div>
              <div>
                <p className="font-semibold text-sm mb-2">Message Template</p>
                <div className="p-3 bg-muted rounded text-sm italic">
                  "{reminder.template}"
                </div>
              </div>
              <Button variant="outline" size="sm">Test Send</Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scheduled Reminders</CardTitle>
          <CardDescription>Upcoming SMS reminders to be sent</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2">Recipient</th>
                  <th className="text-left py-3 px-2">Type</th>
                  <th className="text-left py-3 px-2">Scheduled For</th>
                  <th className="text-left py-3 px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {scheduledReminders.map((reminder) => (
                  <tr key={reminder.id} className="border-b">
                    <td className="py-3 px-2">{reminder.recipient}</td>
                    <td className="py-3 px-2">{reminder.type}</td>
                    <td className="py-3 px-2">{reminder.scheduledFor}</td>
                    <td className="py-3 px-2">
                      <Badge variant="secondary">{reminder.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
