'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

const communicationData = [
  { id: 1, from: 'John Doe', to: 'Manager', subject: 'Water Leak Issue', message: 'There is a leak in my bathroom...', date: '2024-02-03', type: 'Email', status: 'Read' },
  { id: 2, from: 'Manager', to: 'John Doe', subject: 'Re: Water Leak Issue', message: 'Thank you for reporting...', date: '2024-02-03', type: 'Email', status: 'Sent' },
  { id: 3, from: 'Jane Smith', to: 'Manager', subject: 'Rent Payment Question', message: 'When is rent due?', date: '2024-02-02', type: 'SMS', status: 'Read' },
  { id: 4, from: 'Manager', to: 'Jane Smith', subject: 'Rent Payment Question', message: 'Rent is due on the 1st of each month', date: '2024-02-02', type: 'SMS', status: 'Sent' },
]

export function CommunicationsLogTab() {
  const [view, setView] = useState('all')
  const [selectedMessage, setSelectedMessage] = useState(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)

  const filteredData = communicationData.filter(item => {
    if (view === 'inbox') return item.to === 'Manager'
    if (view === 'sent') return item.from === 'Manager'
    return true
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Communications Filter</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Input placeholder="Search by sender/recipient..." className="flex-1" />
          <Input placeholder="Search content..." className="flex-1" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Tabs value={view} onValueChange={setView}>
            <TabsList>
              <TabsTrigger value="all">All ({communicationData.length})</TabsTrigger>
              <TabsTrigger value="inbox">Inbox ({communicationData.filter(i => i.to === 'Manager').length})</TabsTrigger>
              <TabsTrigger value="sent">Sent ({communicationData.filter(i => i.from === 'Manager').length})</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2">From</th>
                  <th className="text-left py-3 px-2">To</th>
                  <th className="text-left py-3 px-2">Subject</th>
                  <th className="text-left py-3 px-2">Date</th>
                  <th className="text-left py-3 px-2">Type</th>
                  <th className="text-left py-3 px-2">Status</th>
                  <th className="text-left py-3 px-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((item) => (
                  <tr key={item.id} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-2">{item.from}</td>
                    <td className="py-3 px-2">{item.to}</td>
                    <td className="py-3 px-2 font-medium">{item.subject}</td>
                    <td className="py-3 px-2">{item.date}</td>
                    <td className="py-3 px-2">
                      <Badge variant="outline">{item.type}</Badge>
                    </td>
                    <td className="py-3 px-2">
                      <Badge variant={item.status === 'Sent' ? 'default' : 'secondary'}>
                        {item.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedMessage(item)
                          setIsDetailsOpen(true)
                        }}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selectedMessage && (
        <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedMessage.subject}</DialogTitle>
              <DialogDescription>
                From: {selectedMessage.from} | To: {selectedMessage.to} | {selectedMessage.date}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded">
                <p className="text-sm">{selectedMessage.message}</p>
              </div>
              <div>
                <label className="text-sm font-semibold block mb-2">Reply</label>
                <Textarea placeholder="Type your reply here..." rows={4} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
                  Close
                </Button>
                <Button>Send Reply</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
