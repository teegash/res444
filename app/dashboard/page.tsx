'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Crown, Building2, Users, DollarSign, Wrench, ArrowUpRight, ArrowDownRight, Droplet, FileText, BarChart3, MessageSquare } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Pie, PieChart, ComposedChart, Line } from 'recharts'
import { OrganizationSetupModal } from '@/components/dashboard/organization-setup-modal'
import { useAuth } from '@/lib/auth/context'
import { SkeletonLoader, SkeletonPropertyCard, SkeletonTable } from '@/components/ui/skeletons'
import { formatCurrency } from '@/lib/format/currency'
import { cn } from '@/lib/utils'

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-500">
          Loading dashboard...
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  )
}

function DashboardContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const setupParam = searchParams.get('setup')
  const [showSetupModal, setShowSetupModal] = useState(setupParam === '1')
  const { user } = useAuth()
  const [organization, setOrganization] = useState<{
    id: string
    name: string
    email: string
    phone: string | null
    location: string | null
    registration_number: string | null
    logo_url: string | null
    user_role: string
  } | null>(null)
  const [loadingOrg, setLoadingOrg] = useState(true)

  // Fetch organization data
  useEffect(() => {
    const fetchOrganization = async () => {
      if (!user) {
        console.log('[Dashboard] No user, skipping organization fetch')
        setLoadingOrg(false)
        return
      }

      console.log('[Dashboard] Fetching organization for user:', user.id, user.email)

      try {
        const response = await fetch('/api/organizations/current', {
          credentials: 'include',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        })
        
        console.log('[Dashboard] Organization fetch response:', {
          status: response.status,
          ok: response.ok,
          statusText: response.statusText,
        })

        // Handle 404 gracefully - it just means user doesn't have an organization yet
        if (response.status === 404) {
          // No organization found - this is expected for new users
          console.log('[Dashboard] No organization found (404) - user may need to create one')
          setOrganization(null)
          setLoadingOrg(false)
          return
        }

        if (!response.ok) {
          // Only log non-404 errors
          console.error('[Dashboard] Error fetching organization:', response.status, response.statusText)
          const errorText = await response.text()
          console.error('[Dashboard] Error response body:', errorText)
          setLoadingOrg(false)
          return
        }

        const result = await response.json()
        console.log('[Dashboard] Organization fetch result:', {
          success: result.success,
          hasData: !!result.data,
          orgName: result.data?.name,
          orgLogo: result.data?.logo_url ? 'present' : 'missing',
          orgId: result.data?.id,
        })

        if (result.success && result.data) {
          console.log('[Dashboard] ✓ Setting organization:', {
            name: result.data.name,
            logo_url: result.data.logo_url,
            id: result.data.id,
          })
          setOrganization(result.data)
        } else {
          // No organization data - set to null gracefully
          console.warn('[Dashboard] ✗ No organization data in result:', result)
          setOrganization(null)
        }
      } catch (error) {
        // Network errors or other exceptions
        console.error('[Dashboard] Exception fetching organization:', error)
        setOrganization(null)
      } finally {
        setLoadingOrg(false)
      }
    }

    // Add a small delay to ensure user is fully loaded
    const timeoutId = setTimeout(() => {
      fetchOrganization()
    }, 100)

    return () => clearTimeout(timeoutId)
  }, [user])

  useEffect(() => {
    setShowSetupModal(setupParam === '1')
  }, [setupParam])

  const handleModalClose = useCallback(() => {
    setShowSetupModal(false)
    if (setupParam === '1') {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('setup')
      const nextPath = params.toString() ? `${pathname}?${params.toString()}` : pathname
      router.replace(nextPath, { scroll: false })
    }
  }, [pathname, router, searchParams, setupParam])

  const [overview, setOverview] = useState<{
    summary: {
      totalProperties: number
      totalTenants: number
      monthlyRevenue: number
      revenueDelta: number | null
      pendingRequests: number
      paidInvoices: number
      pendingPayments: number
    }
    revenue: {
      series: { label: string; key: string; revenue: number }[]
      currentMonthRevenue: number
      prevMonthRevenue: number
    }
    propertyRevenue: { name: string; revenue: number }[]
    payments: { paid: number; pending: number }
    expenses?: {
      monthly: { label: string; key: string; expenses: number }[]
    }
    maintenance: Array<{
      id: string
      title: string
      status: string
      priority: string
      created_at: string | null
      property: string
      unit: string
    }>
  } | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)

  const revenueSeries = overview?.revenue?.series || []
  const expensesSeries = overview?.expenses?.monthly || []
  const propertyRevenue = overview?.propertyRevenue || []
  const paymentData = useMemo(
    () => [
      { name: 'Paid', value: overview?.payments?.paid || 0, color: '#22c55e' },
      { name: 'Pending', value: overview?.payments?.pending || 0, color: '#eab308' },
    ],
    [overview?.payments]
  )

  const collectedPercentage = useMemo(() => {
    const total = paymentData.reduce((acc, item) => acc + item.value, 0)
    if (total === 0) return 0
    return Math.round((paymentData[0].value / total) * 100)
  }, [paymentData])

  const revenueExpenseSeries = useMemo(() => {
    return revenueSeries.map((r) => {
      const expense = expensesSeries.find((e) => e.key === r.key)
      return {
        ...r,
        expenses: expense?.expenses || 0,
      }
    })
  }, [revenueSeries, expensesSeries])

  const incomeProgress = useMemo(() => {
    if (!propertyRevenue.length) return []
    const total = propertyRevenue.reduce((sum, item) => sum + item.revenue, 0)
    return propertyRevenue
      .slice()
      .sort((a, b) => b.revenue - a.revenue)
      .map((item) => ({
        ...item,
        percent: total ? Math.round((item.revenue / total) * 100) : 0,
      }))
  }, [propertyRevenue])

  useEffect(() => {
    const loadOverview = async () => {
      try {
        setOverviewError(null)
        const res = await fetch('/api/dashboard/manager/overview', { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Failed to load dashboard data')
        }
        setOverview(json)
      } catch (err) {
        setOverviewError(err instanceof Error ? err.message : 'Unable to load dashboard data')
        setOverview(null)
      }
    }
    loadOverview()
  }, [])

  if (loadingOrg) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header />
          <main className="flex-1 p-6 overflow-auto">
            <div className="max-w-7xl mx-auto space-y-6">
              <div className="space-y-3">
                <SkeletonLoader height={16} width="40%" />
                <SkeletonLoader height={28} width="55%" />
                <SkeletonLoader height={14} width="60%" />
              </div>
              <SkeletonPropertyCard count={3} />
              <SkeletonTable rows={4} columns={4} />
            </div>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Welcome Header */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <Crown className="w-8 h-8 text-[#4682B4]" />
                    <h1 className="text-3xl font-bold text-gray-900">
                      Welcome back, Manager
                  </h1>
                </div>
                <p className="text-gray-600">
                  {organization?.location 
                    ? `Here's what's happening at ${organization.location} today.`
                    : "Here's what's happening with your premium properties today."}
                </p>
                {organization && (
                  <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                    {organization.email && <span>📧 {organization.email}</span>}
                    {organization.phone && <span>📞 {organization.phone}</span>}
                  </div>
                )}
              </div>
              <Link href="/dashboard/properties/new">
                <Button className="bg-[#4682B4] hover:bg-[#4682B4]/90">
                  + Add Property
                </Button>
              </Link>
            </div>

            {overviewError && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="py-4 text-red-700 text-sm">
                  {overviewError}
                </CardContent>
              </Card>
            )}

            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Total Properties</p>
                      <p className="text-3xl font-bold">{overview?.summary?.totalProperties ?? '—'}</p>
                      <p className="text-sm text-green-600 mt-1">Portfolio snapshot</p>
                    </div>
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-[#4682B4]" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Active Tenants</p>
                      <p className="text-3xl font-bold">{overview?.summary?.totalTenants ?? '—'}</p>
                      <p className="text-sm text-green-600 mt-1">Live occupants</p>
                    </div>
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                      <Users className="w-6 h-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Monthly Revenue</p>
                      <p className="text-3xl font-bold">
                        {overview ? formatCurrency(overview.summary.monthlyRevenue || 0, 'KES') : '—'}
                      </p>
                      {overview?.summary?.revenueDelta !== null ? (
                        <p
                          className={`text-sm mt-1 flex items-center gap-1 ${
                            (overview.summary.revenueDelta || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {(overview.summary.revenueDelta || 0) >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                          {Math.abs(overview.summary.revenueDelta || 0).toFixed(1)}% vs last month
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500 mt-1">Trend pending</p>
                      )}
                    </div>
                    <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                      <DollarSign className="w-6 h-6 text-orange-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Pending Requests</p>
                      <p className="text-3xl font-bold">{overview?.summary?.pendingRequests ?? '—'}</p>
                      <p className="text-sm text-gray-500 mt-1">Open maintenance</p>
                    </div>
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                      <Wrench className="w-6 h-6 text-red-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-[#4682B4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                    <div>
                      <CardTitle className="text-xl">Revenue Trends</CardTitle>
                      <CardDescription>Month-by-month rent revenue</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={revenueSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="label" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const current = payload[0].payload as { revenue: number; label: string; key: string }
                          const index = revenueSeries.findIndex((m) => m.key === current.key)
                          const prev = index > 0 ? revenueSeries[index - 1] : null
                          const delta =
                            prev && prev.revenue !== 0
                              ? ((current.revenue - prev.revenue) / prev.revenue) * 100
                              : null
                          return (
                            <div className="rounded-xl bg-white px-3 py-2 shadow-md border border-gray-200">
                              <p className="text-xs text-gray-500">{current.key}</p>
                              <p className="text-lg font-semibold text-gray-900">{formatCurrency(current.revenue, 'KES')}</p>
                              {delta !== null && (
                                <p
                                  className={`text-xs flex items-center gap-1 ${
                                    delta >= 0 ? 'text-green-600' : 'text-red-600'
                                  }`}
                                >
                                  {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                  {Math.abs(delta).toFixed(1)}% vs prev month
                                </p>
                              )}
                            </div>
                          )
                        }}
                      />
                      <Bar dataKey="revenue" radius={[10, 10, 6, 6]}>
                        {revenueSeries.map((entry, index) => (
                          <Cell
                            key={`bar-${entry.key}`}
                            fill={index === revenueSeries.length - 1 ? '#7c3aed' : '#c7d2fe'}
                            stroke="#7c3aed"
                            strokeWidth={index === revenueSeries.length - 1 ? 1.5 : 0}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <DollarSign className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Revenue vs Expenses</CardTitle>
                      <CardDescription>Single-month prepayments reflected live</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={revenueExpenseSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="label" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip />
                      <Bar dataKey="revenue" fill="#7c3aed" radius={[10, 10, 6, 6]} />
                      <Line
                        type="monotone"
                        dataKey="expenses"
                        stroke="#ef4444"
                        strokeWidth={2}
                        dot={{ r: 4, fill: '#ef4444' }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Property insights row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-orange-600" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Property Revenue Comparison</CardTitle>
                      <CardDescription>Revenue generated by each property</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={propertyRevenue}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" stroke="#6b7280" />
                      <YAxis stroke="#6b7280" />
                      <Tooltip />
                      <Bar dataKey="revenue" radius={[8, 8, 0, 0]}>
                        {propertyRevenue.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill="#4682B4" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                      <DollarSign className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Income per Property</CardTitle>
                      <CardDescription>Progress share of total rent collected</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {incomeProgress.length ? (
                    incomeProgress.map((item) => (
                      <div key={item.name}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-medium text-gray-900">{item.name}</p>
                          <p className="text-sm text-gray-600">{formatCurrency(item.revenue, 'KES')}</p>
                        </div>
                        <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                          <div
                            className="h-2 rounded-full bg-gradient-to-r from-[#7c3aed] to-[#4f46e5]"
                            style={{ width: `${Math.min(item.percent, 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{item.percent}% of total</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">No property income to display yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Payment status & occupancy (payment focus) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <DollarSign className="w-6 h-6 text-[#4682B4]" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Payment Status</CardTitle>
                      <CardDescription>Verified vs pending rent payments</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center">
                    <div className="relative">
                      <ResponsiveContainer width={300} height={220}>
                        <PieChart>
                          <Pie
                            data={paymentData}
                            cx={150}
                            cy={150}
                            startAngle={180}
                            endAngle={0}
                            innerRadius={80}
                            outerRadius={120}
                            dataKey="value"
                          >
                            {paymentData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute top-24 left-1/2 transform -translate-x-1/2 text-center">
                        <p className="text-5xl font-bold text-[#4682B4]">{collectedPercentage}%</p>
                        <p className="text-sm text-gray-600">Verified</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6 mt-4 w-full">
                      {paymentData.map((item) => (
                        <div key={item.name} className="text-center">
                          <div className="flex items-center justify-center gap-2 mb-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="text-sm text-gray-600">{item.name}</span>
                          </div>
                          <p className="text-2xl font-bold">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Occupancy Snapshot</CardTitle>
                      <CardDescription>Top properties by collected rent share</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {incomeProgress.length ? (
                    incomeProgress.slice(0, 4).map((item) => (
                      <div key={item.name}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-gray-900">{item.name}</p>
                            <p className="text-xs text-gray-500">{formatCurrency(item.revenue, 'KES')}</p>
                          </div>
                          <span className="text-sm font-medium text-gray-700">{item.percent}%</span>
                        </div>
                        <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                          <div
                            className="h-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-600"
                            style={{ width: `${Math.min(item.percent, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">No occupancy data to display yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Maintenance */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                      <Wrench className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Recent Maintenance</CardTitle>
                      <CardDescription>Latest reported issues</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {overview?.maintenance?.length ? (
                    overview.maintenance.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between rounded-lg border border-gray-100 p-3 bg-white"
                      >
                        <div>
                          <p className="font-semibold text-gray-900">{item.title}</p>
                          <p className="text-sm text-gray-600">
                            {item.property} • {item.unit}
                          </p>
                          <p className="text-xs text-gray-500">
                            {item.created_at
                              ? new Date(item.created_at).toLocaleString()
                              : '—'}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span
                            className={cn(
                              'text-xs px-2 py-1 rounded-full font-medium',
                              item.status === 'resolved'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                : 'bg-amber-50 text-amber-700 border border-amber-100'
                            )}
                          >
                            {item.status}
                          </span>
                          <span
                            className={cn(
                              'text-xs px-2 py-1 rounded-full font-medium capitalize',
                              item.priority === 'high'
                                ? 'bg-red-50 text-red-700 border border-red-100'
                                : item.priority === 'low'
                                  ? 'bg-gray-50 text-gray-700 border border-gray-100'
                                  : 'bg-blue-50 text-blue-700 border border-blue-100'
                            )}
                          >
                            {item.priority} priority
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">No recent maintenance requests.</p>
                  )}
                </CardContent>
              </Card>

              {/* Quick menu */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: 'Water Bill History', href: '/dashboard/water-bills/statements', icon: Droplet, color: 'from-blue-500 to-cyan-500' },
                  { label: 'Financial Statements', href: '/dashboard/manager/statements', icon: FileText, color: 'from-emerald-500 to-green-500' },
                  { label: 'Occupancy Report', href: '/dashboard/manager/reports/occupancy', icon: BarChart3, color: 'from-violet-500 to-indigo-500' },
                  { label: 'Tenant Messages', href: '/dashboard/communications', icon: MessageSquare, color: 'from-orange-500 to-amber-500' },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <Link key={item.label} href={item.href}>
                      <Card className="h-full hover:shadow-lg transition-shadow border-0 bg-gradient-to-br text-white relative overflow-hidden">
                        <div className={`absolute inset-0 opacity-90 bg-gradient-to-br ${item.color}`} />
                        <CardContent className="relative z-10 flex items-center gap-3 py-6">
                          <div className="p-3 bg-white/15 rounded-xl backdrop-blur">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-semibold">{item.label}</p>
                            <p className="text-xs text-white/80">Open</p>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>
        </main>
      </div>
      <OrganizationSetupModal open={showSetupModal} onClose={handleModalClose} />
    </div>
  )
}
