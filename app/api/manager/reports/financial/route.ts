import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { bucketKey, defaultGroupBy, getPeriodRange, resolveRange, safePct } from '../utils'

type GroupBy = 'day' | 'week' | 'month'

type StatementRow = {
  property: string
  property_id: string | null
  month: string | null
  income: number
  expenses: number
}

function isoDate(value: string | null | undefined) {
  if (!value) return null
  return value.length >= 10 ? value.slice(0, 10) : null
}

function endExclusiveIso(endIso: string | null | undefined) {
  if (!endIso) return null
  const d = new Date(`${endIso.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const mode =
      url.searchParams.get('mode') || (url.searchParams.get('property') ? 'statement' : 'report')

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
      return NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 })
    }

    const orgId = membership.organization_id

    if (mode === 'statement') {
      return handleStatement({ request, admin, orgId })
    }

    const period = url.searchParams.get('period') || 'month'
    const propertyId = url.searchParams.get('propertyId') || 'all'
    const groupByParam = (url.searchParams.get('groupBy') || '') as GroupBy | ''
    const startDate = url.searchParams.get('startDate')
    const endDate = url.searchParams.get('endDate')

    const range = resolveRange({ period, startDate, endDate })
    const groupBy: GroupBy = groupByParam || defaultGroupBy(range.start, range.end)
    const scopePropertyId = propertyId !== 'all' ? propertyId : null
    const paymentEndExclusive = endExclusiveIso(range.end)

    const { data: properties, error: propErr } = await admin
      .from('apartment_buildings')
      .select('id, name')
      .eq('organization_id', orgId)
      .order('name', { ascending: true })
    if (propErr) throw propErr

    let paymentsQuery = admin
      .from('payments')
      .select(
        `
        id,
        amount_paid,
        payment_date,
        verified,
        payment_method,
        mpesa_receipt_number,
        bank_reference_number,
        deposit_slip_url,
        months_paid,
        applied_to_prepayment,
        tenant_user_id,
        created_at,
        invoice:invoices!payments_invoice_org_fk (
          id,
          invoice_type,
          lease:leases!invoices_lease_org_fk (
            unit:apartment_units (
              building:apartment_buildings!apartment_units_building_org_fk ( id, name )
            )
          )
        )
      `
      )
      .eq('organization_id', orgId)
      .eq('verified', true)

    if (range.start) paymentsQuery = paymentsQuery.gte('payment_date', range.start)
    if (paymentEndExclusive) paymentsQuery = paymentsQuery.lt('payment_date', paymentEndExclusive)

    const { data: payments, error: paymentsError } = await paymentsQuery
    if (paymentsError) throw paymentsError

    const scopedPayments =
      scopePropertyId
        ? (payments || []).filter((p: any) => p.invoice?.lease?.unit?.building?.id === scopePropertyId)
        : payments || []

    const incomeTotals = { rent: 0, water: 0, other: 0, total: 0 }
    const incomeByProperty = new Map<string, number>()
    const incomeSeriesMap = new Map<
      string,
      { period: string; total: number; rent: number; water: number; other: number }
    >()

    const ledger: Array<{
      date: string
      type: 'income' | 'expense'
      category: string
      propertyId: string | null
      propertyName: string
      amount: number
      source: string
      sourceId: string | null
      reference: string | null
      paymentMethod: string | null
      receiptUrl: string | null
      tenantUserId: string | null
      invoiceType: string | null
      monthsPaid: number | null
      isPrepayment: boolean
      createdAt: string | null
      notes: string | null
    }> = []

    for (const payment of scopedPayments) {
      const amount = Number(payment.amount_paid || 0)
      const invoiceType = payment.invoice?.invoice_type || 'other'
      const type = invoiceType === 'rent' || invoiceType === 'water' ? invoiceType : 'other'
      const prop = payment.invoice?.lease?.unit?.building

      incomeTotals.total += amount
      if (type === 'rent') incomeTotals.rent += amount
      else if (type === 'water') incomeTotals.water += amount
      else incomeTotals.other += amount

      if (prop?.id) {
        incomeByProperty.set(prop.id, (incomeByProperty.get(prop.id) || 0) + amount)
      }

      const paidDate = isoDate(payment.payment_date)
      if (paidDate) {
        const bucket = bucketKey(paidDate, groupBy)
        const entry =
          incomeSeriesMap.get(bucket) || {
            period: bucket,
            total: 0,
            rent: 0,
            water: 0,
            other: 0,
          }
        entry.total += amount
        if (type === 'rent') entry.rent += amount
        else if (type === 'water') entry.water += amount
        else entry.other += amount
        incomeSeriesMap.set(bucket, entry)
      }

      const reference =
        payment.mpesa_receipt_number ||
        payment.bank_reference_number ||
        payment.id ||
        null
      const monthsPaid = payment.months_paid ? Number(payment.months_paid) : null
      const isPrepayment = Boolean(payment.applied_to_prepayment || (monthsPaid && monthsPaid > 1))

      ledger.push({
        date: paidDate || '',
        type: 'income',
        category: type,
        propertyId: prop?.id || null,
        propertyName: prop?.name || 'Property',
        amount,
        source: 'payment',
        sourceId: payment.id || null,
        reference,
        paymentMethod: payment.payment_method || null,
        receiptUrl: payment.deposit_slip_url || null,
        tenantUserId: payment.tenant_user_id || null,
        invoiceType: payment.invoice?.invoice_type || null,
        monthsPaid,
        isPrepayment,
        createdAt: payment.created_at || null,
        notes: null,
      })
    }

    let expenses: any[] = []
    try {
      let expensesQuery = admin
        .from('expenses')
        .select(
          `
          id,
          amount,
          category,
          incurred_at,
          created_at,
          property_id,
          maintenance_request_id,
          notes,
          property:apartment_buildings ( id, name )
        `
        )
        .eq('organization_id', orgId)

      if (range.start) expensesQuery = expensesQuery.gte('incurred_at', range.start)
      expensesQuery = expensesQuery.lte('incurred_at', range.end)

      const { data: expensesData, error: expensesError } = await expensesQuery
      if (expensesError) throw expensesError
      expenses = expensesData || []
    } catch (err) {
      let fallbackQuery = admin
        .from('expenses')
        .select(
          `
          id,
          amount,
          category,
          incurred_at,
          created_at,
          property_id,
          maintenance_request_id,
          notes,
          property:apartment_buildings ( id, name )
        `
        )
        .eq('organization_id', orgId)

      if (range.start) fallbackQuery = fallbackQuery.gte('created_at', range.start)
      fallbackQuery = fallbackQuery.lte('created_at', range.end)

      const { data: fallbackData } = await fallbackQuery
      expenses = fallbackData || []
    }

    const expenseMaintenanceIds = new Set(
      expenses.map((row: any) => row.maintenance_request_id).filter(Boolean)
    )

    let maintenanceExtras: any[] = []
    try {
      let maintenanceQuery = admin
        .from('maintenance_requests')
        .select(
          `
          id,
          maintenance_cost,
          created_at,
          unit:apartment_units (
            building:apartment_buildings!apartment_units_building_org_fk ( id, name )
          )
        `
        )
        .eq('organization_id', orgId)
        .eq('maintenance_cost_paid_by', 'landlord')
        .gt('maintenance_cost', 0)

      if (range.start) maintenanceQuery = maintenanceQuery.gte('created_at', range.start)
      maintenanceQuery = maintenanceQuery.lte('created_at', range.end)

      const { data: maintenanceRows, error: maintenanceError } = await maintenanceQuery
      if (!maintenanceError) {
        maintenanceExtras =
          (maintenanceRows || [])
            .filter((row: any) => row?.id && !expenseMaintenanceIds.has(row.id))
            .map((row: any) => ({
              id: `maintenance-${row.id}`,
              amount: Number(row.maintenance_cost || 0),
              category: 'maintenance',
              incurred_at: row.created_at,
              created_at: row.created_at,
              property_id: row.unit?.building?.id || null,
              property: row.unit?.building || null,
            })) || []
      }
    } catch (err) {
      maintenanceExtras = []
    }

    const combinedExpenses = [...expenses, ...maintenanceExtras]
    const scopedExpenses = scopePropertyId
      ? combinedExpenses.filter((row: any) => row.property_id === scopePropertyId)
      : combinedExpenses

    const expenseTotals = { total: 0 }
    const expenseByCategory: Record<string, number> = {}
    const expenseByProperty = new Map<string, number>()
    const expenseSeriesMap = new Map<string, { period: string; total: number }>()

    for (const expense of scopedExpenses) {
      const amount = Number(expense.amount || 0)
      const category = expense.category || 'Uncategorized'
      const prop = expense.property
      const dateIso = isoDate(expense.incurred_at) || isoDate(expense.created_at)

      expenseTotals.total += amount
      expenseByCategory[category] = (expenseByCategory[category] || 0) + amount

      if (expense.property_id) {
        expenseByProperty.set(
          expense.property_id,
          (expenseByProperty.get(expense.property_id) || 0) + amount
        )
      }

      if (dateIso) {
        const bucket = bucketKey(dateIso, groupBy)
        const entry = expenseSeriesMap.get(bucket) || { period: bucket, total: 0 }
        entry.total += amount
        expenseSeriesMap.set(bucket, entry)
      }

      ledger.push({
        date: dateIso || '',
        type: 'expense',
        category,
        propertyId: expense.property_id || null,
        propertyName: prop?.name || 'Property',
        amount,
        source: 'expense',
        sourceId: expense.id || null,
        reference: expense.id || null,
        paymentMethod: null,
        receiptUrl: null,
        tenantUserId: null,
        invoiceType: null,
        monthsPaid: null,
        isPrepayment: false,
        createdAt: expense.created_at || expense.incurred_at || null,
        notes: expense.notes || null,
      })
    }

    const propertyIds = new Set([
      ...Array.from(incomeByProperty.keys()),
      ...Array.from(expenseByProperty.keys()),
    ])
    const propertyNameById = new Map((properties || []).map((p: any) => [p.id, p.name]))

    const byProperty = Array.from(propertyIds).map((pid) => {
      const income = incomeByProperty.get(pid) || 0
      const expensesTotal = expenseByProperty.get(pid) || 0
      return {
        propertyId: pid,
        propertyName: propertyNameById.get(pid) || 'Property',
        income,
        expenses: expensesTotal,
        noi: income - expensesTotal,
      }
    })

    const incomeSeries = Array.from(incomeSeriesMap.values()).sort((a, b) =>
      a.period.localeCompare(b.period)
    )
    const expenseSeries = Array.from(expenseSeriesMap.values()).sort((a, b) =>
      a.period.localeCompare(b.period)
    )

    const totalIncome = incomeTotals.total
    const totalExpenses = expenseTotals.total
    const netOperatingIncome = totalIncome - totalExpenses
    const expenseRatio = safePct(totalExpenses, totalIncome)

    ledger.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

    return NextResponse.json({
      success: true,
      data: {
        range,
        groupBy,
        properties: properties || [],
        kpis: {
          totalIncome,
          totalExpenses,
          netOperatingIncome,
          expenseRatio,
        },
        incomeSeries,
        expenseSeries,
        incomeBreakdown: incomeTotals,
        expenseBreakdown: {
          total: expenseTotals.total,
          categories: expenseByCategory,
        },
        byProperty,
        ledger,
      },
    })
  } catch (error) {
    console.error('[Reports.Financial] Failed to load financial report', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load financial report.' },
      { status: 500 }
    )
  }
}

async function handleStatement(args: {
  request: NextRequest
  admin: ReturnType<typeof createAdminClient>
  orgId: string
}) {
  const { request, admin, orgId } = args
  const period = request.nextUrl.searchParams.get('period') || 'quarter'
  const propertyFilter = request.nextUrl.searchParams.get('property') || 'all'
  const { startDate, endDate } = getPeriodRange(period)
  const paymentEndExclusive = endExclusiveIso(endDate)

  const paymentsQuery = admin
    .from('payments')
    .select(
      `
      amount_paid,
      payment_date,
      invoice:invoices!payments_invoice_org_fk (
        lease_id,
        lease:leases!invoices_lease_org_fk (
          unit:apartment_units (
            building:apartment_buildings!apartment_units_building_org_fk (
              id,
              name,
              location
            )
          )
        )
      )
    `
    )
    .eq('organization_id', orgId)
    .order('payment_date', { ascending: false })

  if (startDate) {
    paymentsQuery.gte('payment_date', startDate)
  }
  if (paymentEndExclusive) {
    paymentsQuery.lt('payment_date', paymentEndExclusive)
  }

  const { data: payments, error: paymentsError } = await paymentsQuery
  if (paymentsError) throw paymentsError

  let expenses: any[] = []
  try {
    const expensesQuery = admin
      .from('expenses')
      .select(
        `
        id,
        amount,
        incurred_at,
        property_id,
        category,
        apartment_buildings ( id, name, location )
      `
      )
      .eq('organization_id', orgId)

    if (startDate) {
      expensesQuery.gte('incurred_at', startDate)
    }
    if (endDate) {
      expensesQuery.lte('incurred_at', endDate)
    }
    if (propertyFilter && propertyFilter !== 'all') {
      expensesQuery.eq('property_id', propertyFilter)
    }

    const { data: expensesData } = await expensesQuery
    expenses = expensesData || []
  } catch (err) {
    expenses = []
  }

  const rows: StatementRow[] = [
    ...(payments || []).map((payment: any) => {
      const building = payment.invoice?.lease?.unit?.building
      const date = payment.payment_date ? new Date(payment.payment_date) : null
      const monthLabel = date
        ? date.toLocaleString('default', { month: 'short', year: 'numeric' })
        : null
      return {
        property: building?.name || 'Property',
        property_id: building?.id || null,
        month: monthLabel,
        income: Number(payment.amount_paid || 0),
        expenses: 0,
      }
    }),
    ...expenses.map((expense: any) => {
      const building = expense.apartment_buildings
      const date = expense.incurred_at ? new Date(expense.incurred_at) : null
      const monthLabel = date
        ? date.toLocaleString('default', { month: 'short', year: 'numeric' })
        : null
      return {
        property: building?.name || 'Property',
        property_id: building?.id || expense.property_id || null,
        month: monthLabel,
        income: 0,
        expenses: Number(expense.amount || 0),
      }
    }),
  ]

  const scoped =
    propertyFilter === 'all'
      ? rows
      : rows.filter((row) => row.property === propertyFilter || row.property_id === propertyFilter)

  const aggregates = new Map<
    string,
    { property: string; property_id: string | null; month: string | null; income: number; expenses: number }
  >()

  scoped.forEach((row) => {
    const key = `${row.property_id || row.property || 'property'}|${row.month || 'unknown'}`
    const existing = aggregates.get(key) || {
      property: row.property,
      property_id: row.property_id,
      month: row.month,
      income: 0,
      expenses: 0,
    }
    existing.income += row.income || 0
    existing.expenses += row.expenses || 0
    aggregates.set(key, existing)
  })

  const aggregatedRows = Array.from(aggregates.values())

  return NextResponse.json({ success: true, data: aggregatedRows })
}
