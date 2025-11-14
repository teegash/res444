'use client'

import { Sidebar } from '@/components/dashboard/sidebar'
import { AlertTriangle, Plus } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'

export default function ManagerNoticesPage() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 p-8 ml-16">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-yellow-600" />
            </div>
            <h1 className="text-3xl font-bold">Send Notice</h1>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Send New Notice */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="text-lg">📨</span>
                <CardTitle>Send New Notice</CardTitle>
              </div>
              <CardDescription>Send important notices to your tenants</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Notice Type */}
              <div className="space-y-2">
                <Label htmlFor="notice-type">Notice Type</Label>
                <Select>
                  <SelectTrigger id="notice-type">
                    <SelectValue placeholder="Select notice type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="payment">Payment Reminder</SelectItem>
                    <SelectItem value="policy">Policy Update</SelectItem>
                    <SelectItem value="general">General Announcement</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Recipients */}
              <div className="space-y-3">
                <Label>Recipients</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="all-tenants" />
                    <Label htmlFor="all-tenants" className="cursor-pointer font-medium">
                      All Tenants
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="kilimani" />
                    <Label htmlFor="kilimani" className="cursor-pointer">
                      Kilimani Heights
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="westlands" />
                    <Label htmlFor="westlands" className="cursor-pointer">
                      Westlands Plaza
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="karen" />
                    <Label htmlFor="karen" className="cursor-pointer">
                      Karen Villas
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="eastlands" />
                    <Label htmlFor="eastlands" className="cursor-pointer">
                      Eastlands Court
                    </Label>
                  </div>
                </div>
              </div>

              {/* Notice Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Notice Title</Label>
                <Input id="title" placeholder="Enter notice title" />
              </div>

              {/* Message */}
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea 
                  id="message" 
                  placeholder="Enter your notice message here..."
                  rows={5}
                />
              </div>

              {/* Delivery Method */}
              <div className="space-y-3">
                <Label>Delivery Method</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="email" defaultChecked />
                    <Label htmlFor="email" className="cursor-pointer">
                      Email
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="sms" />
                    <Label htmlFor="sms" className="cursor-pointer">
                      SMS
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="app" defaultChecked />
                    <Label htmlFor="app" className="cursor-pointer">
                      App Notification
                    </Label>
                  </div>
                </div>
              </div>

              {/* Priority Level */}
              <div className="space-y-2">
                <Label htmlFor="priority">Priority Level</Label>
                <Select defaultValue="normal">
                  <SelectTrigger id="priority">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button className="w-full" size="lg">
                <Plus className="h-4 w-4 mr-2" />
                Send Notice
              </Button>
            </CardContent>
          </Card>

          {/* Recent Notices */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Notices</CardTitle>
              <CardDescription>Previously sent notices to tenants</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-semibold text-red-900">Water Maintenance Schedule</h4>
                    <p className="text-xs text-red-700 mt-1">
                      Water will be shut off on Dec 15th from 9 AM to 2 PM for maintenance.
                    </p>
                  </div>
                  <Badge className="bg-green-600">Sent</Badge>
                </div>
                <div className="flex items-center gap-4 text-xs text-red-600 mt-3">
                  <span>To: All Tenants</span>
                  <span>•</span>
                  <span>Dec 10, 2024</span>
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-semibold">Rent Increase Notice</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Effective January 2025, rent will increase by 5% as per lease agreement.
                    </p>
                  </div>
                  <Badge className="bg-green-600">Sent</Badge>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-3">
                  <span>To: Kilimani Heights</span>
                  <span>•</span>
                  <span>Dec 8, 2024</span>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg border">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-semibold">Holiday Office Hours</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Office will be closed from Dec 24th to Jan 2nd. Emergency contact: 254712345678
                    </p>
                  </div>
                  <Badge className="bg-green-600">Sent</Badge>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-3">
                  <span>To: All Tenants</span>
                  <span>•</span>
                  <span>Dec 5, 2024</span>
                </div>
              </div>

              <Button variant="outline" className="w-full">
                View All Notices
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Quick Notice Templates */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Notice Templates</CardTitle>
            <CardDescription>Use pre-made templates for common notices</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { title: 'Rent Reminder', icon: '💰' },
                { title: 'Maintenance Notice', icon: '🔧' },
                { title: 'Policy Update', icon: '📋' }
              ].map((template) => (
                <Card key={template.title} className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-6 text-center">
                    <div className="text-4xl mb-2">{template.icon}</div>
                    <h4 className="font-medium mb-3">{template.title}</h4>
                    <Button variant="outline" size="sm" className="w-full">
                      <Plus className="h-3 w-3 mr-1" />
                      Use Template
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
