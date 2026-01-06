'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Crown, Building2, Users, DollarSign, Wrench, ArrowUpRight, ArrowDownRight, Droplet, BarChart3, MessageSquare, FileText, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, Pie, PieChart } from 'recharts'
import { OrganizationSetupModal } from '@/components/dashboard/organization-setup-modal'
import { useAuth } from '@/lib/auth/context'
import { SkeletonLoader, SkeletonPropertyCard, SkeletonTable } from '@/components/ui/skeletons'
import { formatCurrency } from '@/lib/format/currency'
import { cn } from '@/lib/utils'
import { ProgressCircle } from '@/components/ProgressCircle'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

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
  const [userFullName, setUserFullName] = useState<string | null>(null)
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

  useEffect(() => {
    let cancelled = false

    const fetchUserProfile = async () => {
      if (!user?.id) return

      try {
        const response = await fetch(`/api/user/profile?userId=${user.id}`, {
          credentials: 'include',
          cache: 'no-store',
        })

        if (!response.ok) return

        const result = await response.json()
        if (!cancelled && result?.success && result?.data?.full_name) {
          setUserFullName(result.data.full_name)
        }
      } catch (error) {
        console.error('[Dashboard] Failed to fetch user profile:', error)
      }
    }

    fetchUserProfile()
    return () => {
      cancelled = true
    }
  }, [user?.id])

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
    arrears?: Array<{
      lease_id: string
      tenant_id: string
      tenant_name: string
      tenant_phone: string | null
      unit_number: string
      arrears_amount: number
      open_invoices: number
      oldest_due_date: string | null
    }>
    prepayments?: Array<{
      lease_id: string
      tenant_id: string
      unit_id: string
      unit_number?: string | null
      tenant_name?: string | null
      tenant_phone?: string | null
      rent_paid_until: string | null
      next_rent_due_date: string | null
      prepaid_months: number
      is_prepaid?: boolean
    }>
  } | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [topTenants, setTopTenants] = useState<Array<{ tenant_id: string; name: string; on_time_rate: number; payments: number }>>([])
  const [worstTenants, setWorstTenants] = useState<
    Array<{ tenant_id: string; name: string; on_time_rate: number; payments: number }>
  >([])
  const [ratingsError, setRatingsError] = useState<string | null>(null)
  const [defaultersSummary, setDefaultersSummary] = useState<{
    active_tenants: number
    defaulters: number
    defaulters_pct: number
    total_arrears_amount: number
  } | null>(null)
  const role =
    organization?.user_role ||
    (user?.user_metadata as any)?.role ||
    (user as any)?.role ||
    null

  const revenueSeries = overview?.revenue?.series || []
  const expensesSeries = overview?.expenses?.monthly || []
  const propertyRevenue = overview?.propertyRevenue || []
  const occupancyData = overview?.occupancy || []
  const propertyIncomeMonthData = overview?.propertyIncomeMonth || []
  const arrearsData = overview?.arrears || []
  const prepayData = overview?.prepayments || []
  const paymentData = useMemo(
    () => [
      { name: 'Paid', value: overview?.payments?.paid || 0, color: '#22c55e' },
      { name: 'Pending', value: overview?.payments?.pending || 0, color: '#eab308' },
      { name: 'Failed', value: overview?.payments?.failed || 0, color: '#ef4444' },
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

  const revenueTrendData = useMemo(() => revenueSeries.slice(-12), [revenueSeries])
  const revenueExpenseTrendData = useMemo(() => revenueExpenseSeries.slice(-12), [revenueExpenseSeries])
  const revenueTrendDelta = useMemo(() => {
    if (revenueTrendData.length < 2) return null
    const last = revenueTrendData[revenueTrendData.length - 1]?.revenue ?? 0
    const prev = revenueTrendData[revenueTrendData.length - 2]?.revenue ?? 0
    if (prev <= 0) return null
    return ((last - prev) / prev) * 100
  }, [revenueTrendData])
  const latestRevenueExpense = revenueExpenseTrendData[revenueExpenseTrendData.length - 1]
  const latestNet =
    latestRevenueExpense ? Number(latestRevenueExpense.revenue || 0) - Number(latestRevenueExpense.expenses || 0) : null

  const RevenueExpenseTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const revenue = payload.find((item: any) => item.dataKey === 'revenue')?.value ?? 0
    const expenses = payload.find((item: any) => item.dataKey === 'expenses')?.value ?? 0
    const net = Number(revenue) - Number(expenses)

    return (
      <div className="border-border/50 bg-background grid min-w-[10rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
        <div className="font-medium">{label}</div>
        <div className="grid gap-1.5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: 'var(--color-revenue)' }} />
            <span className="text-muted-foreground">Revenue</span>
            <span className="ml-auto font-medium text-slate-900">{formatCurrency(revenue, 'KES')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: 'var(--color-expenses)' }} />
            <span className="text-muted-foreground">Expenses</span>
            <span className="ml-auto font-medium text-slate-900">{formatCurrency(expenses, 'KES')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: '#2563eb' }} />
            <span className="text-muted-foreground">Net</span>
            <span className={`ml-auto font-medium ${net >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
              {formatCurrency(net, 'KES')}
            </span>
          </div>
        </div>
      </div>
    )
  }

  const incomeProgressMonth = useMemo(() => {
    if (!propertyIncomeMonthData.length) return []
    return propertyIncomeMonthData
      .slice()
      .sort((a, b) => (b.paid || 0) - (a.paid || 0))
      .map((item: any) => ({
        ...item,
        percent: item.potential ? Math.round((item.paid / item.potential) * 100) : 0,
      }))
  }, [propertyIncomeMonthData])

  const arrearsComputed = useMemo(() => {
    const positives = arrearsData.filter((a) => (a?.arrears_amount || 0) > 0)
    const criticalThreshold = new Date()
    criticalThreshold.setUTCDate(criticalThreshold.getUTCDate() - 30)
    const critical = positives.filter(
      (a) => a.oldest_due_date && new Date(a.oldest_due_date) < criticalThreshold
    )
    const totalAmount = positives.reduce((sum, a) => sum + Number(a.arrears_amount || 0), 0)
    return {
      positives,
      critical,
      totalAmount,
    }
  }, [arrearsData])

  useEffect(() => {
    if (role === 'caretaker') return
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
  }, [role])

  useEffect(() => {
    if (role === 'caretaker') return
    const loadRatings = async () => {
      try {
        setRatingsError(null)
        const res = await fetch('/api/dashboard/manager/tenant-ratings', { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Failed to load tenant ratings')
        }
        const list = (json.data || []) as Array<{
          tenant_id: string
          name: string
          on_time_rate: number | null
          payments: number
        }>
        const rated = list.filter((tenant) => tenant.on_time_rate !== null)
        const worstCandidates = rated.filter((tenant) => (tenant.on_time_rate || 0) < 90)
        const topCandidates = rated.filter((tenant) => (tenant.on_time_rate || 0) >= 90)
        const sortedDesc = [...topCandidates].sort(
          (a, b) => (b.on_time_rate || 0) - (a.on_time_rate || 0) || b.payments - a.payments
        )
        const sortedAsc = [...worstCandidates].sort(
          (a, b) => (a.on_time_rate || 0) - (b.on_time_rate || 0) || b.payments - a.payments
        )
        setTopTenants(sortedDesc.slice(0, 3) as typeof topTenants)
        setWorstTenants(sortedAsc.slice(0, 3) as typeof worstTenants)
      } catch (err) {
        setRatingsError(err instanceof Error ? err.message : 'Unable to load tenant ratings')
        setTopTenants([])
        setWorstTenants([])
      }
    }
    loadRatings()
  }, [role])

  useEffect(() => {
    if (role === 'caretaker') return
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch('/api/dashboard/manager/defaulters-summary', { cache: 'no-store' })
        const json = await res.json()
        if (mounted && res.ok && json.success) {
          setDefaultersSummary(json.data)
        }
      } catch {
        if (mounted) setDefaultersSummary(null)
      }
    })()
    return () => {
      mounted = false
    }
  }, [role])

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

  if (role === 'caretaker') {
    const greetingName =
      userFullName ||
      ((user?.user_metadata as any)?.full_name as string | undefined) ||
      user?.email?.split('@')[0] ||
      'there'
    const quickActions = [
      { label: 'Water Bills', href: '/dashboard/water-bills', icon: Droplet, color: 'bg-blue-50 text-blue-700' },
      { label: 'Tenants', href: '/dashboard/tenants', icon: Users, color: 'bg-emerald-50 text-emerald-700' },
      { label: 'Messages', href: '/dashboard/communications', icon: MessageSquare, color: 'bg-orange-50 text-orange-700' },
      { label: 'Maintenance', href: '/dashboard/maintenance', icon: Wrench, color: 'bg-amber-50 text-amber-700' },
    ]

    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header />
          <main className="flex-1 p-6 overflow-auto">
            <div className="max-w-6xl mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Welcome back, {greetingName}</h1>
                  <p className="text-gray-600">Focus on your property tasks with quick actions.</p>
                </div>
              </div>

              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                {quickActions.map((action) => {
                  const Icon = action.icon
                  return (
                    <Link key={action.label} href={action.href}>
                      <Card className="hover:shadow-md transition-shadow border border-gray-100">
                        <CardContent className="p-4 flex items-center gap-3">
                          <div className={`${action.color} p-3 rounded-lg`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-semibold">{action.label}</p>
                            <p className="text-xs text-muted-foreground">Open</p>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  )
                })}
              </div>
            </div>
          </main>
        </div>
      </div>
    )
  }

  const greetingName =
    userFullName ||
    ((user?.user_metadata as any)?.full_name as string | undefined) ||
    user?.email?.split('@')[0] ||
    'there'

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
                      Welcome back, {greetingName}
                  </h1>
                </div>
                <p className="text-gray-600">
                  {organization?.name
                    ? `Here's what's happening in ${organization.name} today.`
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              <Link
                href="/dashboard/properties"
                className="block h-full rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4682B4]/40"
                aria-label="View properties"
              >
                <Card className="h-full rounded-md cursor-pointer transition-shadow hover:shadow-md">
                  <CardContent className="py-1 h-full">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-base text-gray-700 font-bold">Total Properties</p>
                        <p className="text-3xl font-bold">{overview?.summary?.totalProperties ?? '—'}</p>
                        <p className="text-sm text-green-600 mt-1">Portfolio snapshot</p>
                      </div>
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-[#4682B4]" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <Link
                href="/dashboard/tenants"
                className="block h-full rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4682B4]/40"
                aria-label="View tenants"
              >
                <Card className="h-full rounded-md cursor-pointer transition-shadow hover:shadow-md">
                  <CardContent className="py-1 h-full">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-base text-gray-700 font-bold">Active Tenants</p>
                        <p className="text-3xl font-bold">{overview?.summary?.totalTenants ?? '—'}</p>
                        <p className="text-sm text-green-600 mt-1">Live occupants</p>
                      </div>
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                        <Users className="w-6 h-6 text-green-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <Link
                href="/dashboard/manager/reports"
                className="block h-full rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4682B4]/40"
                aria-label="View reports"
              >
                <Card className="h-full rounded-md cursor-pointer transition-shadow hover:shadow-md">
                  <CardContent className="py-1 h-full">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-base text-gray-700 font-bold">Monthly Revenue</p>
                        <p className="text-[clamp(1rem,2vw,1.5rem)] font-semibold whitespace-nowrap leading-tight">
                          {overview?.summary ? formatCurrency(overview.summary.monthlyRevenue || 0, 'KES') : '—'}
                        </p>
                        {overview?.summary?.revenueDelta !== null ? (
                          <p
                            className={`text-sm mt-1 flex items-center gap-1 ${
                              (overview?.summary?.revenueDelta || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {(overview?.summary?.revenueDelta || 0) >= 0 ? (
                              <ArrowUpRight className="h-4 w-4" />
                            ) : (
                              <ArrowDownRight className="h-4 w-4" />
                            )}
                            {Math.abs(overview?.summary?.revenueDelta || 0).toFixed(1)}% vs last month
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
              </Link>

              <Link
                href="/dashboard/maintenance"
                className="block h-full rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4682B4]/40"
                aria-label="View maintenance requests"
              >
                <Card className="h-full rounded-md cursor-pointer transition-shadow hover:shadow-md">
                  <CardContent className="py-1 h-full">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-base text-gray-700 font-bold">Pending Requests</p>
                        <p className="text-3xl font-bold">{overview?.summary?.pendingRequests ?? '—'}</p>
                        <p className="text-sm text-gray-500 mt-1">Open maintenance</p>
                      </div>
                      <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                        <Wrench className="w-6 h-6 text-red-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <Link
                href="/dashboard/finances/arrears"
                className="block h-full rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4682B4]/40"
                aria-label="View arrears"
              >
                <Card className="h-full rounded-md cursor-pointer transition-shadow hover:shadow-md">
                  <CardContent className="py-1 h-full">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-base text-gray-700 font-bold">Arrears</p>
                        <p className="text-[clamp(1.2rem,2.4vw,1.875rem)] font-bold whitespace-nowrap">
                          {defaultersSummary?.defaulters ?? '—'}{' '}
                          <span className="text-xs font-medium text-gray-500">Tenants</span>
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {defaultersSummary ? formatCurrency(defaultersSummary.total_arrears_amount || 0, 'KES') : '—'}
                        </p>
                      </div>
                      <ProgressCircle value={defaultersSummary?.defaulters_pct || 0} className="text-red-600">
                        <span className="text-xs font-semibold text-red-700">
                          {defaultersSummary?.defaulters_pct ?? 0}%
                        </span>
                      </ProgressCircle>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border border-slate-200/70 bg-white/95 shadow-sm">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-blue-700" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Revenue Trends</CardTitle>
                      <CardDescription>Last 12 months of rent revenue</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={
                      {
                        revenue: { label: 'Revenue', color: '#93c5fd' },
                      } satisfies ChartConfig
                    }
                    className="h-[160px] w-full aspect-auto"
                  >
                    <BarChart accessibilityLayer data={revenueTrendData} barCategoryGap={14} barSize={20}>
                      <CartesianGrid vertical={false} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        width={56}
                        tickFormatter={(value) => `${Math.abs(Number(value)) >= 1000000 ? `${Math.round(Number(value) / 1000000)}M` : Math.abs(Number(value)) >= 1000 ? `${Math.round(Number(value) / 1000)}k` : Number(value)}`}
                      />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        tickMargin={10}
                        axisLine={false}
                        tickFormatter={(value) => String(value).slice(0, 3)}
                      />
                      <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                      <Bar dataKey="revenue" fill="var(--color-revenue)" radius={8} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
                <div className="px-6 pb-5 pt-1 text-sm text-slate-600">
                  <div className="flex items-center gap-2 font-medium text-slate-800">
                    {revenueTrendDelta === null
                      ? 'Steady performance'
                      : `Trending ${revenueTrendDelta >= 0 ? 'up' : 'down'} by ${Math.abs(revenueTrendDelta).toFixed(1)}%`}
                    <TrendingUp className={`h-4 w-4 ${revenueTrendDelta !== null && revenueTrendDelta < 0 ? 'rotate-180 text-rose-500' : 'text-emerald-600'}`} />
                  </div>
                  <div className="text-muted-foreground">Showing total revenue for the last 12 months.</div>
                </div>
              </Card>

              <Card className="border border-slate-200/70 bg-white/95 shadow-sm">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white flex items-center justify-center">
                      <DollarSign className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Revenue vs Expenses</CardTitle>
                      <CardDescription>Monthly comparison across the last year</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={
                      {
                        revenue: { label: 'Revenue', color: '#16a34a' },
                        expenses: { label: 'Expenses', color: '#ef4444' },
                      } satisfies ChartConfig
                    }
                    className="h-[160px] w-full aspect-auto"
                  >
                    <BarChart accessibilityLayer data={revenueExpenseTrendData} barCategoryGap={12} barSize={12}>
                      <CartesianGrid vertical={false} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        width={56}
                        tickFormatter={(value) => `${Math.abs(Number(value)) >= 1000000 ? `${Math.round(Number(value) / 1000000)}M` : Math.abs(Number(value)) >= 1000 ? `${Math.round(Number(value) / 1000)}k` : Number(value)}`}
                      />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        tickMargin={10}
                        axisLine={false}
                        tickFormatter={(value) => String(value).slice(0, 3)}
                      />
                      <ChartTooltip cursor={false} content={<RevenueExpenseTooltip />} />
                      <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
                      <Bar dataKey="expenses" fill="var(--color-expenses)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
                <div className="px-6 pb-5 pt-1 text-sm text-slate-600">
                  <div className="flex items-center gap-2 font-medium text-slate-800">
                    {latestNet === null
                      ? 'Balanced performance'
                      : latestNet >= 0
                        ? `Net positive ${formatCurrency(latestNet, 'KES')}`
                        : `Net negative ${formatCurrency(Math.abs(latestNet), 'KES')}`}
                    <TrendingUp className={`h-4 w-4 ${latestNet !== null && latestNet < 0 ? 'rotate-180 text-rose-500' : 'text-emerald-600'}`} />
                  </div>
                  <div className="text-muted-foreground">Revenue in green, expenses in red.</div>
                </div>
              </Card>
            </div>

            {/* Property insights row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                      <Users className="w-6 h-6 text-orange-600" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Tenant Ratings</CardTitle>
                      <CardDescription>Best vs worst by rent payment timeliness</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {ratingsError && <p className="text-sm text-red-600">{ratingsError}</p>}
                  {!ratingsError && topTenants.length === 0 && worstTenants.length === 0 && (
                    <p className="text-sm text-gray-500">No tenant ratings yet.</p>
                  )}
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-700">Best Tenants</p>
                      {topTenants.map((tenant) => {
                        const rate = tenant.on_time_rate || 0
                        let dot = 'bg-red-500'
                        if (rate >= 90) dot = 'bg-green-500'
                        else if (rate >= 80) dot = 'bg-yellow-400'
                        else if (rate >= 70) dot = 'bg-orange-500'
                        return (
                          <div
                            key={tenant.tenant_id}
                            className="flex items-center justify-between rounded-lg border border-gray-100 p-2"
                          >
                            <div className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full ${dot}`} aria-hidden />
                              <div>
                                <p className="text-sm font-semibold text-gray-900">{tenant.name}</p>
                                <p className="text-[11px] text-gray-500">{tenant.payments} payments</p>
                              </div>
                            </div>
                            <p className="text-sm font-semibold text-gray-900">{rate}%</p>
                          </div>
                        )
                      })}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-700">Worst Tenants</p>
                        <Link href="/dashboard/tenants" className="text-[11px] text-primary hover:underline">
                          View tenants
                        </Link>
                      </div>
                      {worstTenants.length === 0 && !ratingsError && (
                        <p className="text-sm text-gray-500">No yellow/orange/red tenants yet.</p>
                      )}
                      {worstTenants.map((tenant) => {
                        const rate = tenant.on_time_rate || 0
                        let dot = 'bg-red-500'
                        if (rate >= 90) dot = 'bg-green-500'
                        else if (rate >= 80) dot = 'bg-yellow-400'
                        else if (rate >= 70) dot = 'bg-orange-500'

                        return (
                          <div
                            key={tenant.tenant_id}
                            className="flex items-center justify-between rounded-lg border border-gray-100 p-2"
                          >
                            <div className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full ${dot}`} aria-hidden />
                              <div>
                                <p className="text-sm font-semibold text-gray-900">{tenant.name}</p>
                                <p className="text-[11px] text-gray-500">{tenant.payments} payments</p>
                              </div>
                            </div>
                            <p className="text-sm font-semibold text-gray-900">{rate}%</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
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
                      <CardDescription>Rent paid vs potential (units × rent) this month</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {incomeProgressMonth.length ? (
                    incomeProgressMonth.map((item: any) => (
                      <div key={item.name}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-gray-900">{item.name}</p>
                            <p className="text-xs text-gray-500">
                              {formatCurrency(item.paid, 'KES')} of {formatCurrency(item.potential || 0, 'KES')}
                            </p>
                          </div>
                          <span className="text-sm font-medium text-gray-700">
                            {item.percent}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                          <div
                            className="h-2 rounded-full bg-gradient-to-r from-[#7c3aed] to-[#4f46e5]"
                            style={{ width: `${Math.min(item.percent, 100)}%` }}
                          />
                        </div>
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
                    <div className="flex items-center justify-center gap-4 mt-4 flex-wrap text-sm text-gray-700">
                      {paymentData.map((item) => (
                        <div key={item.name} className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                          <span>{item.name} ({item.value})</span>
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
                      <CardDescription>Units occupied vs total per property</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {occupancyData?.length ? (
                    occupancyData.map((item: any) => {
                      const percent = item.total_units
                        ? Math.round((item.occupied_units / item.total_units) * 100)
                        : 0
                      return (
                        <div key={item.building_id}>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-gray-900">{item.property_name}</p>
                              <p className="text-xs text-gray-500">
                                {item.occupied_units} / {item.total_units} units occupied
                              </p>
                            </div>
                            <span className="text-sm font-medium text-gray-700">{percent}%</span>
                          </div>
                          <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                            <div
                              className="h-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-600"
                              style={{ width: `${Math.min(percent, 100)}%` }}
                            />
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-sm text-gray-500">No occupancy data to display yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>

	            {/* Arrears and Prepayment */}
	            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
	              <Card className="border border-red-100/80 bg-gradient-to-br from-red-50/40 to-white">
	                <CardHeader className="flex flex-col gap-2">
	                  <CardTitle>Arrears</CardTitle>
	                  <CardDescription>Outstanding rent by tenant/unit</CardDescription>
	                  <div className="flex flex-wrap gap-3 text-sm text-gray-700">
	                    <span className="px-3 py-1 rounded-full bg-red-50 text-red-700 border border-red-100">
                      Critical (&gt;30d): {arrearsComputed.critical.length}
                    </span>
                    <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                      Open: {arrearsComputed.positives.length}
                    </span>
                    <span className="px-3 py-1 rounded-full bg-slate-50 text-slate-700 border border-slate-200">
                      Total: {formatCurrency(arrearsComputed.totalAmount, 'KES')}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {arrearsComputed.positives.length === 0 ? (
                    <p className="text-sm text-gray-500">No arrears recorded.</p>
	                  ) : (
	                    <div className="space-y-2">
	                      {arrearsComputed.positives.slice(0, 6).map((row) => (
	                        <div
	                          key={row.lease_id}
	                          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border p-3 ${
	                            arrearsComputed.critical.find((c) => c.lease_id === row.lease_id)
	                              ? 'border-red-200 bg-red-50/50'
	                              : 'border-slate-200 bg-white hover:bg-red-50/20'
	                          }`}
	                        >
	                          <div className="space-y-1">
	                            <p className="font-semibold text-gray-900">
	                              {row.unit_number || 'Unit'} &mdash; {row.tenant_name}
	                            </p>
                            <p className="text-xs text-gray-500">
                              Open invoices: {row.open_invoices} • Oldest due:{' '}
                              {row.oldest_due_date ? new Date(row.oldest_due_date).toLocaleDateString() : '—'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-500">Arrears</p>
                            <p className="text-lg font-bold text-red-600">
                              {formatCurrency(row.arrears_amount, 'KES')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
	                  )}
	                </CardContent>
	              </Card>

	              <Card className="border border-emerald-100/80 bg-gradient-to-br from-emerald-50/40 to-white">
	                <CardHeader>
	                  <CardTitle>Prepayments</CardTitle>
	                  <CardDescription>Paid-until pointers and upcoming rent</CardDescription>
	                </CardHeader>
	                <CardContent className="space-y-3">
                  {prepayData.length === 0 ? (
                    <p className="text-sm text-gray-500">No prepayment records yet.</p>
	                  ) : (
	                    <div className="space-y-2">
	                      {prepayData.slice(0, 6).map((row) => (
	                        <div
	                          key={row.lease_id}
	                          className="rounded-lg border border-emerald-100 bg-white/80 p-3 flex items-center justify-between hover:bg-emerald-50/30 transition-colors"
	                        >
	                          <div>
	                            <p className="font-semibold text-gray-900">
	                              {row.unit_number ? `Unit ${row.unit_number}` : `Lease ${row.lease_id.slice(0, 6)}...`}
	                              {row.tenant_name ? <span className="text-gray-500"> — {row.tenant_name}</span> : null}
	                            </p>
	                            <p className="text-xs text-gray-500">
	                              Paid until:{' '}
	                              <span className="font-medium text-emerald-700">{row.rent_paid_until || '—'}</span>
	                              <span className="text-gray-400"> • </span>
	                              Next due:{' '}
	                              <span className="font-medium text-emerald-700">{row.next_rent_due_date || '—'}</span>
	                            </p>
	                          </div>
	                          <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
	                            {row.prepaid_months || 0} mo prepaid
	                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

	            {/* Bottom Row: Maintenance left, quick links right */}
	            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-6">
	              <Card className="border border-orange-100/80 bg-gradient-to-br from-orange-50/40 to-white">
	                <CardHeader>
	                  <div className="flex items-center gap-3">
	                    <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
	                      <Wrench className="w-5 h-5 text-orange-600" />
	                    </div>
	                    <div>
	                  <CardTitle className="text-lg">Recent Maintenance</CardTitle>
	                  <CardDescription>Latest reported issues</CardDescription>
	                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
	              {Array.isArray(overview?.maintenance) && overview.maintenance.length ? (
	                overview.maintenance.slice(0, 3).map((item) => (
	                  <Link
	                    key={item.id}
	                    href="/dashboard/maintenance"
	                    className="block rounded-lg border border-orange-100 p-3 bg-white/80 hover:bg-orange-50/30 hover:shadow-sm transition-all"
	                  >
	                    <div className="flex items-start justify-between">
	                      <div>
	                        <p className="font-semibold text-gray-900">{item.title}</p>
	                        <p className="text-sm text-gray-600">
                          {item.property} • {item.unit}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.updated_at
                            ? new Date(item.updated_at).toLocaleString()
                            : item.created_at
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
                  </Link>
                ))
              ) : (
                <p className="text-sm text-gray-500">No recent maintenance requests.</p>
              )}
            </CardContent>
          </Card>

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
                      <Card className="h-full hover:shadow-lg hover:shadow-purple-200 transition-shadow border-0 bg-gradient-to-br text-white relative overflow-hidden">
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

              {/* Removed Top On-Time Tenants card as requested */}
            </div>
          </div>
        </main>
      </div>
      <OrganizationSetupModal open={showSetupModal} onClose={handleModalClose} />
    </div>
  )
}
