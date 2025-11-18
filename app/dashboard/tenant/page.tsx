'use client'

import { useCallback, useEffect, useState } from 'react'
import { TenantHeader } from '@/components/dashboard/tenant/tenant-header'
import { TenantInfoCards } from '@/components/dashboard/tenant/tenant-info-cards'
import { TenantQuickActions } from '@/components/dashboard/tenant/tenant-quick-actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Calendar, Bell, TrendingUp, Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import Link from 'next/link'

type TenantSummary = {
  profile: {
    full_name: string | null
    phone_number: string | null
    profile_picture_url: string | null
    address: string | null
  } | null
  lease: {
    id: string
    status: string | null
    start_date: string | null
    end_date: string | null
    monthly_rent: number | null
    unit_number: string | null
    unit_label: string | null
    property_name: string | null
    property_location: string | null
    unit_price_text: string | null
  } | null
} | null

type TenantInvoiceRecord = {
  id: string
  amount: number
  due_date: string | null
  status: boolean
  invoice_type: string | null
  property_name: string | null
  property_location: string | null
  unit_label: string | null
} | null

export default function TenantDashboard() {
  const [summary, setSummary] = useState<TenantSummary>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingInvoice, setPendingInvoice] = useState<TenantInvoiceRecord>(null)

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/tenant/summary', { cache: 'no-store' })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to load tenant info.')
      }
      const payload = await response.json()
      setSummary(payload.data || null)
    } catch (err) {
      console.error('[TenantDashboard] summary fetch failed', err)
      setError(err instanceof Error ? err.message : 'Unable to load tenant info.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  const fetchPendingInvoice = useCallback(async () => {
    try {
      const response = await fetch('/api/tenant/invoices?status=pending', { cache: 'no-store' })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to load pending invoices.')
      }
      const payload = await response.json()
      setPendingInvoice(payload.data?.[0] || null)
    } catch (err) {
      console.error('[TenantDashboard] pending invoice fetch failed', err)
      setPendingInvoice(null)
    }
  }, [])

  useEffect(() => {
    fetchPendingInvoice()
  }, [fetchPendingInvoice])

  const formatDate = (value: string | null | undefined) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/30 via-white to-orange-50/20">
      <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <TenantHeader summary={summary} onProfileUpdated={fetchSummary} loading={loading} />
        <TenantInfoCards summary={summary} loading={loading} />
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
                  <p className="text-sm font-medium">Next Payment Due</p>
                  <Badge variant="destructive" className="text-xs">{pendingInvoice ? 'Due Soon' : 'Clear'}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {pendingInvoice ? formatDate(pendingInvoice.due_date) : 'No outstanding payments'}
                </p>
                {pendingInvoice ? (
                  <Link href={`/dashboard/tenant/invoices/${pendingInvoice.id}`}>
                    <Button size="sm" className="w-full mt-2" variant="outline">
                      Pay {pendingInvoice.invoice_type === 'water' ? 'Water Bill' : 'Invoice'}
                    </Button>
                  </Link>
                ) : (
                  <Button size="sm" className="w-full mt-2" variant="outline" disabled>
                    All Paid
                  </Button>
                )}
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
