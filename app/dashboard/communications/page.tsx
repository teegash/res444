'use client'

import { useState } from 'react'
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
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'

export default function CommunicationsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('messages')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newMessage, setNewMessage] = useState('')

  const messages = [
    { id: 1, tenant: 'John Doe', message: 'Payment received for Unit 101', date: '2024-11-10', type: 'info' },
    { id: 2, tenant: 'Jane Smith', message: 'Maintenance scheduled for tomorrow', date: '2024-11-09', type: 'alert' },
  ]

  const reminderTemplates = [
    { id: 1, name: 'Rent Payment', message: 'Your rent of KES [AMOUNT] is due on [DATE]. Pay via M-Pesa to [NUMBER]', type: 'rent' },
    { id: 2, name: 'Water Bill', message: 'Your water bill of KES [AMOUNT] is due on [DATE]', type: 'utility' },
    { id: 3, name: 'Maintenance Update', message: 'Maintenance update for your unit: [DETAILS]', type: 'maintenance' },
    { id: 4, name: 'Lease Renewal', message: 'Your lease expires on [DATE]. Please contact us to renew.', type: 'lease' },
  ]

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
              {reminderTemplates.map((template) => (
                <Card key={template.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{template.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">{template.message}</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1">
                        Test Send
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1">
                        Edit
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
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
                <Button className="gap-2">
                  <Send className="w-4 h-4" />
                  Send to All Tenants
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
        </main>
      </div>
    </div>
  )
}
