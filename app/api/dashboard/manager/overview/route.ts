import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

type InvoiceRow = {
  id: string
  amount: number | null
  status: boolean | null
  due_date: string | null
  invoice_type: string | null
  leases?: {
    unit_id?: string | null
    apartment_units?: {
      building_id?: string | null
      apartment_buildings?: {
        name?: string | null
      } | null
    } | null
  } | null
}

type PaymentRow = {
  id: string
  amount_paid: number | null
  verified: boolean | null
  payment_date: string | null
}

type MaintenanceRow = {
  id: string
  title?: string | null
  description?: string | null
  status?: string | null
  priority?: string | null
  created_at?: string | null
  unit?: {
    unit_number?: string | null
    apartment_buildings?: {
      name?: string | null
    } | null
  } | null
}

export async function GET() {
  const admin = createAdminClient()

  try {
    const now = new Date()
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1))
    const startIso = start.toISOString().split('T')[0]

    const [propertiesRes, tenantsRes, invoicesRes, paymentsRes, maintenanceRes] = await Promise.all([
      admin.from('apartment_buildings').select('id, name'),
      admin.from('user_profiles').select('id').eq('role', 'tenant'),
      admin
        .from('invoices')
        .select(
          `
          id,
          amount,
          status,
          due_date,
          invoice_type,
          leases (
            unit_id,
            apartment_units (
              building_id,
              apartment_buildings (
                name
              )
            )
          )
        `
        )
        .eq('invoice_type', 'rent')
        .gte('due_date', startIso),
      admin.from('payments').select('id, amount_paid, verified, payment_date'),
      admin
        .from('maintenance_requests')
        .select(
          `
          id,
          title,
          description,
          status,
          priority,
          created_at,
          unit:apartment_units (
            unit_number,
            apartment_buildings (
              name
            )
          )
        `
        )
        .order('created_at', { ascending: false })
        .limit(6),
    ])

    const invoices = (invoicesRes.data || []) as InvoiceRow[]
    const payments = (paymentsRes.data || []) as PaymentRow[]
    const maintenance = (maintenanceRes.data || []) as MaintenanceRow[]

    // Revenue by month (last 12 months)
    const months: { label: string; key: string; revenue: number }[] = []
    for (let i = 11; i >= 0; i -= 1) {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
      const label = date.toLocaleString('default', { month: 'short' })
      months.push({ label, key, revenue: 0 })
    }

    invoices.forEach((inv) => {
      if (!inv.due_date || inv.invoice_type !== 'rent') return
      const key = inv.due_date.slice(0, 7)
      const bucket = months.find((m) => m.key === key)
      if (bucket) {
        bucket.revenue += Number(inv.amount || 0)
      }
    })

    // Month-over-month delta for current month
    const currentMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    const prevMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    const prevMonthKey = `${prevMonthDate.getUTCFullYear()}-${String(prevMonthDate.getUTCMonth() + 1).padStart(2, '0')}`
    const currentMonthRevenue = months.find((m) => m.key === currentMonthKey)?.revenue || 0
    const prevMonthRevenue = months.find((m) => m.key === prevMonthKey)?.revenue || 0
    const revenueDelta =
      prevMonthRevenue === 0 ? null : ((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100

    // Property revenue grouping
    const propertyRevenueMap = new Map<string, number>()
    invoices
      .filter((inv) => inv.status === true)
      .forEach((inv) => {
        const name =
          inv.leases?.apartment_units?.apartment_buildings?.name || inv.leases?.apartment_units?.building_id || 'Unassigned'
        propertyRevenueMap.set(name, (propertyRevenueMap.get(name) || 0) + Number(inv.amount || 0))
      })
    const propertyRevenue = Array.from(propertyRevenueMap.entries()).map(([name, revenue]) => ({
      name,
      revenue,
    }))

    // Payment status distribution
    const paidCount = payments.filter((p) => p.verified).length
    const pendingCount = payments.filter((p) => !p.verified).length

    // Recent maintenance mapped
    const maintenanceItems = maintenance.map((m) => ({
      id: m.id,
      title: m.title || 'Maintenance',
      status: m.status || 'open',
      priority: m.priority || 'medium',
      created_at: m.created_at,
      property: m.unit?.apartment_buildings?.name || 'Unassigned',
      unit: m.unit?.unit_number || 'Unit',
    }))

    const totalProperties = propertiesRes.data?.length || 0
    const totalTenants = tenantsRes.data?.length || 0
    const totalRevenue = months.reduce((sum, m) => sum + m.revenue, 0)
    const totalPaidInvoices = invoices.filter((i) => i.status === true).length

    return NextResponse.json({
      success: true,
      summary: {
        totalProperties,
        totalTenants,
        monthlyRevenue: currentMonthRevenue,
        revenueDelta,
        pendingRequests: maintenanceItems.filter((m) => m.status !== 'resolved').length,
        paidInvoices: totalPaidInvoices,
        pendingPayments: pendingCount,
      },
      revenue: {
        series: months,
        currentMonthRevenue,
        prevMonthRevenue,
      },
      propertyRevenue,
      payments: {
        paid: paidCount,
        pending: pendingCount,
      },
      maintenance: maintenanceItems,
    })
  } catch (error) {
    console.error('[DashboardOverview] failed to load overview', error)
    return NextResponse.json({ success: false, error: 'Failed to load dashboard overview' }, { status: 500 })
  }
}
