'use client'

import { TenantHeader } from '@/components/dashboard/tenant/tenant-header'
import { TenantInfoCards } from '@/components/dashboard/tenant/tenant-info-cards'
import { TenantQuickActions } from '@/components/dashboard/tenant/tenant-quick-actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, Bell, TrendingUp, Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default function TenantDashboard() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/30 via-white to-orange-50/20">
      <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <TenantHeader />
        <TenantInfoCards />
        <TenantQuickActions />
        
        <div className="grid gap-6 md:grid-cols-3 mt-8">
          {/* Recent Activity */}
          <Card className="md:col-span-2 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                Recent Activity
              </CardTitle>
              <Link href="/dashboard/tenant/notices">
                <Button variant="ghost" size="sm">View All</Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50 border border-green-100">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Payment Received</p>
                  <p className="text-xs text-muted-foreground">Your December rent payment has been confirmed</p>
                  <p className="text-xs text-muted-foreground mt-1">2 days ago</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-100">
                <Bell className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">New Notice Posted</p>
                  <p className="text-xs text-muted-foreground">Building maintenance scheduled for this weekend</p>
                  <p className="text-xs text-muted-foreground mt-1">5 days ago</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-50 border border-orange-100">
                <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Maintenance Update</p>
                  <p className="text-xs text-muted-foreground">Your plumbing request is in progress</p>
                  <p className="text-xs text-muted-foreground mt-1">1 week ago</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Events */}
          <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5 text-orange-600" />
                Upcoming
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium">Rent Due</p>
                  <Badge variant="destructive" className="text-xs">Due Soon</Badge>
                </div>
                <p className="text-xs text-muted-foreground">January 5, 2025</p>
                <Link href="/dashboard/tenant/payment">
                  <Button size="sm" className="w-full mt-2" variant="outline">
                    Pay Now
                  </Button>
                </Link>
              </div>
              
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-sm font-medium mb-1">Lease Renewal</p>
                <p className="text-xs text-muted-foreground">Review due: March 1, 2025</p>
                <Link href="/dashboard/tenant/lease">
                  <Button size="sm" className="w-full mt-2" variant="outline">
                    View Lease
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Stats */}
        <Card className="bg-gradient-to-br from-blue-600 to-orange-500 text-white shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-5 w-5" />
              <h3 className="text-lg font-bold">Your Rental Summary</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm opacity-90">Payments Made</p>
                <p className="text-2xl font-bold">12</p>
              </div>
              <div>
                <p className="text-sm opacity-90">On-time Rate</p>
                <p className="text-2xl font-bold">100%</p>
              </div>
              <div>
                <p className="text-sm opacity-90">Maintenance</p>
                <p className="text-2xl font-bold">3</p>
              </div>
              <div>
                <p className="text-sm opacity-90">Messages</p>
                <p className="text-2xl font-bold">8</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
