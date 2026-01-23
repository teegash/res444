'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, Bell } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'

export default function NoticesPage() {
  const [searchValue, setSearchValue] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')

  const notices = [
    {
      id: 'notice-1',
      title: 'Water Maintenance Schedule',
      body:
        'Dear Residents, We will be conducting scheduled water maintenance on December 15th, 2024, from 9:00 AM to 2:00 PM. During this time, water supply will be temporarily interrupted. We apologize for any inconvenience and appreciate your understanding.',
      date: 'Dec 10, 2024',
      priority: 'high',
      category: 'maintenance',
    },
    {
      id: 'notice-2',
      title: 'January 2025 Rent Reminder',
      body:
        'This is a friendly reminder that your January 2025 rent payment of KES 45,000 is due on January 1st, 2025. Please ensure payment is made on time to avoid any late fees.',
      date: 'Dec 8, 2024',
      priority: 'normal',
      category: 'payment',
    },
    {
      id: 'notice-3',
      title: 'Holiday Office Hours',
      body:
        'Please note that our office will be closed from December 24th, 2024 to January 2nd, 2025 for the holiday season. For emergencies, please contact our emergency line at +254 712 345 678.',
      date: 'Dec 5, 2024',
      priority: 'normal',
      category: 'general',
    },
    {
      id: 'notice-4',
      title: 'Building Security Update',
      body:
        'We have upgraded our building security system. New access cards will be distributed starting December 12th. Please visit the office during business hours to collect your new card.',
      date: 'Dec 3, 2024',
      priority: 'normal',
      category: 'security',
    },
    {
      id: 'notice-5',
      title: 'Parking Policy Reminder',
      body:
        "Please ensure all vehicles are parked in designated spots only. Unauthorized parking in visitor spaces or blocking emergency exits will result in towing at owner's expense.",
      date: 'Nov 28, 2024',
      priority: 'low',
      category: 'policy',
    },
  ]

  const filteredNotices = useMemo(() => {
    const query = searchValue.trim().toLowerCase()
    return notices.filter((notice) => {
      if (categoryFilter !== 'all' && notice.category !== categoryFilter) return false
      if (priorityFilter !== 'all' && notice.priority !== priorityFilter) return false
      if (!query) return true
      return (
        notice.title.toLowerCase().includes(query) ||
        notice.body.toLowerCase().includes(query)
      )
    })
  }, [categoryFilter, notices, priorityFilter, searchValue])

  return (
    <div className="min-h-screen bg-gradient-to-b from-yellow-50/30 via-white to-white">
      <div className="max-w-5xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-4 mb-3 md:mb-6">
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
            <h1 className="text-xl md:text-2xl font-bold">Notices & Announcements</h1>
          </div>
          <Button className="ml-auto hidden md:inline-flex" variant="outline" size="sm">
            Mark All as Read
          </Button>
        </div>
        <div className="md:hidden">
          <Button variant="outline" size="xs" className="h-8 px-3 text-xs">
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
              <Input
                placeholder="Search notices..."
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                className="w-full"
              />
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full">
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
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-full">
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
            {filteredNotices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notices match your filters.</p>
            ) : (
              filteredNotices.map((notice) => {
                const isHigh = notice.priority === 'high'
                const isPayment = notice.category === 'payment'
                const isMaintenance = notice.category === 'maintenance'
                const cardTone = isHigh
                  ? 'bg-red-50 border-red-200'
                  : isPayment
                    ? 'bg-blue-50 border-blue-200'
                    : isMaintenance
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-gray-50 border'
                const titleTone = isHigh ? 'text-red-900' : 'text-foreground'
                const bodyTone = isHigh ? 'text-red-800' : 'text-muted-foreground'
                const dateTone = isHigh ? 'text-red-600' : 'text-muted-foreground'
                return (
                  <div key={notice.id} className={`p-6 rounded-lg ${cardTone}`}>
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <h3 className={`font-semibold text-lg break-words ${titleTone}`}>
                            {notice.title}
                          </h3>
                          <Badge className={isHigh ? 'bg-red-600' : 'bg-slate-600'}>
                            {notice.priority.charAt(0).toUpperCase() + notice.priority.slice(1)}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={
                              isMaintenance
                                ? 'border-amber-400 text-amber-700'
                                : isPayment
                                  ? 'border-blue-400 text-blue-700'
                                  : isHigh
                                    ? 'border-red-400 text-red-700'
                                    : 'border-slate-300 text-slate-600'
                            }
                          >
                            {notice.category.charAt(0).toUpperCase() + notice.category.slice(1)}
                          </Badge>
                        </div>
                        <p className={`text-sm mb-3 break-words ${bodyTone}`}>{notice.body}</p>
                        <p className={`text-xs ${dateTone}`}>{notice.date}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className={isHigh ? 'bg-white' : ''}>
                        Mark as Read
                      </Button>
                      <Button size="sm" variant="outline" className={isHigh ? 'bg-white' : ''}>
                        Archive
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
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
