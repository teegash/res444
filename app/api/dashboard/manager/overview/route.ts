import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const parseRent = (value?: string | number | null) => {
  if (typeof value === 'number' && !Number.isNaN(value) && value > 0) return value
  if (typeof value === 'string') {
    const numeric = Number(value.replace(/[^0-9.]/g, ''))
    if (!Number.isNaN(numeric) && numeric > 0) return numeric
  }
  return 0
}

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
  mpesa_response_code?: string | null
  mpesa_query_status?: string | null
}

type MaintenanceRow = {
  id: string
  title?: string | null
  description?: string | null
  status?: string | null
  priority?: string | null
  created_at?: string | null
  updated_at?: string | null
  unit?: {
    unit_number?: string | null
    apartment_buildings?: {
      name?: string | null
    } | null
  } | null
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: membership, error: membershipError } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError || !membership?.organization_id) {
    return NextResponse.json({ success: false, error: 'Organization not found for user.' }, { status: 403 })
  }

  const orgId = membership.organization_id

  try {
    const now = new Date()
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1))
    const startIso = start.toISOString().split('T')[0]

    const [
      propertiesRes,
      tenantsRes,
      invoicesRes,
      paymentsRes,
      maintenanceRes,
      maintenanceOpenCountRes,
      expensesRes,
      unitsRes,
      arrearsRes,
      prepayRes,
    ] =
      await Promise.all([
        admin.from('apartment_buildings').select('id, name').eq('organization_id', orgId),
        admin.from('user_profiles').select('id').eq('role', 'tenant').eq('organization_id', orgId),
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
          .eq('organization_id', orgId)
          .gte('due_date', startIso),
        admin
          .from('payments')
          .select('id, amount_paid, verified, payment_date, mpesa_response_code, mpesa_query_status')
          .eq('organization_id', orgId),
        admin
          .from('maintenance_requests')
          .select(
            `
          id,
          title,
          description,
          status,
          created_at,
          updated_at,
          unit:apartment_units (
            unit_number,
            apartment_buildings (
              name
            )
          )
        `
          )
          .eq('organization_id', orgId)
          .order('updated_at', { ascending: false })
          .limit(10),
        admin
          .from('maintenance_requests')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('status', 'open'),
        admin
          .from('expenses')
          .select('id, amount, incurred_at, property_id, organization_id')
          .eq('organization_id', orgId)
          .gte('incurred_at', startIso),
        admin
          .from('apartment_units')
          .select(
            `
          id,
          building_id,
          unit_price_category,
          leases!left ( status, monthly_rent )
        `
          )
          .eq('organization_id', orgId),
        admin
          .from('vw_lease_arrears')
          .select(
            `
          lease_id,
          tenant_user_id,
          organization_id,
          unit_id,
          arrears_amount,
          open_invoices_count,
          oldest_due_date,
          apartment_units!left ( unit_number ),
          user_profiles:tenant_user_id!inner ( full_name, phone_number )
        `
          )
          .eq('organization_id', orgId)
          .order('arrears_amount', { ascending: false }),
        admin
          .from('vw_lease_prepayment_status')
          .select('lease_id, tenant_user_id, organization_id, unit_id, rent_paid_until, next_rent_due_date, prepaid_months')
          .eq('organization_id', orgId),
      ])

    const fetchErrors = [
      propertiesRes.error,
      tenantsRes.error,
      invoicesRes.error,
      paymentsRes.error,
      maintenanceRes.error,
      maintenanceOpenCountRes.error,
      expensesRes.error,
      unitsRes.error,
      arrearsRes.error,
      prepayRes.error,
    ].filter(Boolean)
    if (fetchErrors.length) {
      // Log but continue with whatever data we have so the dashboard still renders
      console.error('[DashboardOverview] Fetch warnings', fetchErrors)
    }

    const invoices = (invoicesRes.data || []) as InvoiceRow[]
    const payments = (paymentsRes.data || []) as any[]
    const maintenance = (maintenanceRes.data || []) as MaintenanceRow[]
    const expenses = expensesRes.data || []
    const units = unitsRes.data || []
    const arrears = (arrearsRes.data || []).map((row: any) => ({
      lease_id: row.lease_id,
      tenant_id: row.tenant_user_id,
      tenant_name: row.user_profiles?.full_name || 'Tenant',
      tenant_phone: row.user_profiles?.phone_number || null,
      unit_number: row.apartment_units?.unit_number || '',
      arrears_amount: Number(row.arrears_amount || 0),
      open_invoices: Number(row.open_invoices_count || 0),
      oldest_due_date: row.oldest_due_date || null,
    }))
    const prepayments = (prepayRes.data || []).map((row: any) => ({
      lease_id: row.lease_id,
      tenant_id: row.tenant_user_id,
      unit_id: row.unit_id,
      rent_paid_until: row.rent_paid_until || null,
      next_rent_due_date: row.next_rent_due_date || null,
      prepaid_months: Number(row.prepaid_months || 0),
    }))

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

    // Expenses by month (align with revenue buckets)
    const expenseMonths = new Map<string, number>()
    expenses.forEach((exp: any) => {
      if (!exp.incurred_at) return
      const key = (exp.incurred_at as string).slice(0, 7)
      expenseMonths.set(key, (expenseMonths.get(key) || 0) + Number(exp.amount || 0))
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
    // Property revenue + potential (using invoices of current month)
    const propertyNameMap = new Map<string, string>()
    const propertyNameToId = new Map<string, string>()
    ;(propertiesRes.data || []).forEach((p) => {
      if (p.id) propertyNameMap.set(p.id, p.name || p.id)
      if (p.name) {
        propertyNameMap.set(p.name, p.name)
        propertyNameToId.set(p.name, p.id || p.name)
      }
    })
    const propertyRevenueMap = new Map<string, { paid: number; potential: number; name: string }>()
    const propertyIncomeMonth = new Map<string, { paid: number; potential: number; name: string }>()
    const potentialById = new Map<string, number>()
    invoices.forEach((inv) => {
      const buildingKey =
        inv.leases?.apartment_units?.building_id ||
        inv.leases?.apartment_units?.apartment_buildings?.name ||
        'Unassigned'
      const displayName =
        propertyNameMap.get(inv.leases?.apartment_units?.building_id || '') ||
        propertyNameMap.get(inv.leases?.apartment_units?.apartment_buildings?.name || '') ||
        buildingKey
      const bucket = propertyRevenueMap.get(buildingKey) || { paid: 0, potential: 0, name: displayName }
      const amount = Number(inv.amount || 0)
      bucket.potential += amount
      if (inv.status === true) bucket.paid += amount
      bucket.name = displayName
      propertyRevenueMap.set(buildingKey, bucket)

      // current month focus: track paid only; potential comes from unit rents
      if (inv.due_date && inv.due_date.slice(0, 7) === currentMonthKey) {
        const mBucket = propertyIncomeMonth.get(buildingKey) || {
          paid: 0,
          potential: 0,
          name: displayName,
        }
        if (inv.status === true) mBucket.paid += amount
        mBucket.name = displayName
        propertyIncomeMonth.set(buildingKey, mBucket)
      }
    })
    // Potential based on all units (occupied, vacant, maintenance) = monthly rent * total units
    units.forEach((unit: any) => {
      const bid = unit.building_id || 'Unassigned'
      const leasesArr = Array.isArray(unit.leases) ? unit.leases : []
      const activeLease = leasesArr.find((l: any) => {
        const status = (l?.status || '').toLowerCase()
        return status === 'active' || status === 'pending'
      })
      const rent =
        parseRent(activeLease?.monthly_rent) ||
        parseRent(unit.unit_price_category)
      potentialById.set(bid, (potentialById.get(bid) || 0) + rent)
    })
    const propertyRevenueEntries =
      propertyRevenueMap instanceof Map ? Array.from(propertyRevenueMap.entries()) : []
    const propertyRevenue = Array.isArray(propertyRevenueEntries)
      ? propertyRevenueEntries.map(([key, vals]) => ({
          name: vals.name || propertyNameMap.get(key) || key,
          revenue: vals.paid,
          potential: vals.potential,
          percent: vals.potential ? Math.round((vals.paid / vals.potential) * 100) : 0,
        }))
      : []
    // Ensure every property shows up even if no invoices yet this month
    ;(propertiesRes.data || []).forEach((prop) => {
      const key = prop.id || prop.name || 'Unassigned'
      const potential = potentialById.get(prop.id) || 0
      if (!propertyIncomeMonth.has(key)) {
        propertyIncomeMonth.set(key, {
          paid: 0,
          potential,
          name: prop.name || key,
        })
      } else {
        const existing = propertyIncomeMonth.get(key)
        if (existing) {
          existing.potential = potential
          existing.name = existing.name || prop.name || key
          propertyIncomeMonth.set(key, existing)
        }
      }
    })

    const propertyIncomeEntries =
      propertyIncomeMonth instanceof Map ? Array.from(propertyIncomeMonth.entries()) : []
    const propertyIncomeMonthArr = Array.isArray(propertyIncomeEntries)
      ? propertyIncomeEntries.map(([key, vals]) => {
          const displayName = vals.name || propertyNameMap.get(key) || key
          const buildingId = propertyNameToId.get(displayName) || key
          const unitPotential = potentialById.get(buildingId) || 0
          const potential = unitPotential || vals.potential || 0
          return {
            name: displayName,
            paid: vals.paid,
            potential,
            percent: potential ? Math.round((vals.paid / potential) * 100) : 0,
          }
        })
      : []

    // Payment status distribution
    const failedCount = payments.filter(
      (p) =>
        !p.verified &&
        ((p.mpesa_response_code && p.mpesa_response_code !== '0') ||
          (p.mpesa_query_status && /fail|cancel|timeout|insufficient/i.test(p.mpesa_query_status)))
    ).length
    const paidCount = payments.filter((p) => p.verified).length
    const pendingCount = payments.filter((p) => !p.verified && !failedCount).length

    // Recent maintenance mapped
    const maintenanceItems = Array.isArray(maintenance)
      ? maintenance.map((m) => ({
          id: m.id,
          title: m.title || 'Maintenance',
          status: m.status || 'open',
          priority: m.priority || 'medium',
          created_at: m.created_at,
          updated_at: (m as any).updated_at || null,
          property: m.unit?.apartment_buildings?.name || 'Unassigned',
          unit: m.unit?.unit_number || 'Unit',
        }))
      : []

    const totalProperties = propertiesRes.data?.length || 0
    const totalTenants = tenantsRes.data?.length || 0
    const totalRevenue = months.reduce((sum, m) => sum + m.revenue, 0)
    const totalPaidInvoices = invoices.filter((i) => i.status === true).length
    const openMaintenanceCount =
      typeof maintenanceOpenCountRes.count === 'number' ? maintenanceOpenCountRes.count : 0
    const occupancyMap = new Map<string, { total: number; occupied: number }>()
    units.forEach((unit: any) => {
      const bid = unit.building_id || 'unassigned'
      const bucket = occupancyMap.get(bid) || { total: 0, occupied: 0 }
      bucket.total += 1
      const hasActiveLease = Array.isArray(unit.leases)
        ? unit.leases.some((l: any) => (l?.status || '').toLowerCase() === 'active')
        : false
      if (hasActiveLease) bucket.occupied += 1
      occupancyMap.set(bid, bucket)
    })
    const occupancyEntries = occupancyMap instanceof Map ? Array.from(occupancyMap.entries()) : []
    const occupancy = Array.isArray(occupancyEntries)
      ? occupancyEntries.map(([buildingId, counts]) => ({
          building_id: buildingId,
          property_name: propertiesRes.data?.find((p) => p.id === buildingId)?.name || 'Unassigned',
          total_units: counts.total,
          occupied_units: counts.occupied,
        }))
      : []

    return NextResponse.json({
      success: true,
      summary: {
        totalProperties,
        totalTenants,
        monthlyRevenue: currentMonthRevenue,
        revenueDelta,
        pendingRequests: openMaintenanceCount,
        paidInvoices: totalPaidInvoices,
        pendingPayments: pendingCount,
      },
      revenue: {
        series: months,
        currentMonthRevenue,
        prevMonthRevenue,
      },
      propertyRevenue,
      propertyIncomeMonth: propertyIncomeMonthArr,
      expenses: {
        monthly: Array.from(months, (m) => ({
          label: m.label,
          key: m.key,
          expenses: expenseMonths.get(m.key) || 0,
        })),
      },
      payments: {
        paid: paidCount,
        pending: pendingCount,
        failed: failedCount,
      },
      maintenance: maintenanceItems,
      occupancy,
      arrears,
      prepayments,
    })
  } catch (error) {
    console.error('[DashboardOverview] failed to load overview', error)
    // Return a safe, empty payload so the dashboard can still render without hard-failing
    return NextResponse.json(
      {
        success: true,
        summary: {
          totalProperties: 0,
          totalTenants: 0,
          monthlyRevenue: 0,
          revenueDelta: null,
          pendingRequests: 0,
          paidInvoices: 0,
          pendingPayments: 0,
        },
        revenue: {
          series: [],
          currentMonthRevenue: 0,
          prevMonthRevenue: 0,
        },
        propertyRevenue: [],
        propertyIncomeMonth: [],
        expenses: { monthly: [] },
        payments: { paid: 0, pending: 0, failed: 0 },
        maintenance: [],
        occupancy: [],
        arrears: [],
        prepayments: [],
        error: 'Partial data returned due to an internal error.',
      },
      { status: 200 }
    )
  }
}
