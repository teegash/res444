'use client'

import { ArrowLeft, Bell, Filter } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'

export default function NoticesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-yellow-50/30 via-white to-white">
      <div className="max-w-5xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/tenant">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Bell className="h-5 w-5 text-yellow-600" />
            </div>
            <h1 className="text-2xl font-bold">Notices & Announcements</h1>
          </div>
          <Button className="ml-auto" variant="outline" size="sm">
            Mark All as Read
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="text-blue-600 font-semibold text-2xl">1</CardDescription>
              <CardTitle className="text-sm">Unread Notices</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="text-orange-600 font-semibold text-2xl">1</CardDescription>
              <CardTitle className="text-sm">High Priority</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="text-green-600 font-semibold text-2xl">5</CardDescription>
              <CardTitle className="text-sm">Total This Month</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filter Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filter Notices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <Input placeholder="Search notices..." />
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="policy">Policy</SelectItem>
                </SelectContent>
              </Select>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Recent Notices */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Notices</CardTitle>
            <CardDescription>Important announcements from property management</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* High Priority Notice */}
            <div className="bg-red-50 p-6 rounded-lg border border-red-200">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg text-red-900">Water Maintenance Schedule</h3>
                    <Badge className="bg-red-600">High</Badge>
                    <Badge variant="outline" className="border-red-400 text-red-700">Maintenance</Badge>
                  </div>
                  <p className="text-sm text-red-800 mb-3">
                    Dear Residents, We will be conducting scheduled water maintenance on December 15th, 2024, from 9:00 AM to 2:00 PM. During this time, water supply will be temporarily interrupted. We apologize for any inconvenience and appreciate your understanding.
                  </p>
                  <p className="text-xs text-red-600">Dec 10, 2024</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="bg-white">Mark as Read</Button>
                <Button size="sm" variant="outline" className="bg-white">Archive</Button>
              </div>
            </div>

            {/* Normal Priority Notice */}
            <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg">January 2025 Rent Reminder</h3>
                    <Badge variant="secondary">Normal</Badge>
                    <Badge variant="outline" className="border-blue-400 text-blue-700">Payment</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    This is a friendly reminder that your January 2025 rent payment of KES 45,000 is due on January 1st, 2025. Please ensure payment is made on time to avoid any late fees.
                  </p>
                  <p className="text-xs text-muted-foreground">Dec 8, 2024</p>
                </div>
              </div>
              <Button size="sm" variant="outline">Archive</Button>
            </div>

            <div className="bg-gray-50 p-6 rounded-lg border">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg">Holiday Office Hours</h3>
                    <Badge variant="secondary">Normal</Badge>
                    <Badge variant="outline">General</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Please note that our office will be closed from December 24th, 2024 to January 2nd, 2025 for the holiday season. For emergencies, please contact our emergency line at +254 712 345 678.
                  </p>
                  <p className="text-xs text-muted-foreground">Dec 5, 2024</p>
                </div>
              </div>
              <Button size="sm" variant="outline">Archive</Button>
            </div>

            <div className="bg-gray-50 p-6 rounded-lg border">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg">Building Security Update</h3>
                    <Badge variant="secondary">Normal</Badge>
                    <Badge variant="outline">Security</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    We have upgraded our building security system. New access cards will be distributed starting December 12th. Please visit the office during business hours to collect your new card.
                  </p>
                  <p className="text-xs text-muted-foreground">Dec 3, 2024</p>
                </div>
              </div>
              <Button size="sm" variant="outline">Archive</Button>
            </div>

            <div className="bg-gray-50 p-6 rounded-lg border">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg">Parking Policy Reminder</h3>
                    <Badge variant="secondary">Low</Badge>
                    <Badge variant="outline">Policy</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Please ensure all vehicles are parked in designated spots only. Unauthorized parking in visitor spaces or blocking emergency exits will result in towing at owner's expense.
                  </p>
                  <p className="text-xs text-muted-foreground">Nov 28, 2024</p>
                </div>
              </div>
              <Button size="sm" variant="outline">Archive</Button>
            </div>
          </CardContent>
        </Card>

        {/* Notification Preferences */}
        <Card>
          <CardHeader>
            <CardTitle>Notification Preferences</CardTitle>
            <CardDescription>Choose how you want to receive notices</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">Email Notifications</p>
                <p className="text-sm text-muted-foreground">Receive notices via email</p>
              </div>
              <Badge className="bg-green-100 text-green-700">Enabled</Badge>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">SMS Notifications</p>
                <p className="text-sm text-muted-foreground">Receive urgent notices via SMS</p>
              </div>
              <Badge variant="secondary">Disabled</Badge>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">App Notifications</p>
                <p className="text-sm text-muted-foreground">Push notifications in the app</p>
              </div>
              <Badge className="bg-green-100 text-green-700">Enabled</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
