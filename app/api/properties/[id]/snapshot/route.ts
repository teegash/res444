import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function toISODate(d: Date) {
  return d.toISOString().split('T')[0]
}

function monthKeyUTC(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthNameShort(monthKey: string) {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1, 1))
  return d.toLocaleString('en-US', { month: 'short' })
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
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
  const propertyId = ctx.params.id

  const monthsParam = new URL(req.url).searchParams.get('months')
  const months = monthsParam === '12' ? 12 : 6

  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  const rangeStart = toISODate(start)
  const rangeEnd = toISODate(end)

  const { data: property, error: propertyError } = await admin
    .from('apartment_buildings')
    .select('id, name, location')
    .eq('organization_id', orgId)
    .eq('id', propertyId)
    .maybeSingle()

  if (propertyError || !property) {
    return NextResponse.json({ success: false, error: 'Property not found.' }, { status: 404 })
  }

  const { data: units, error: unitsError } = await admin
    .from('apartment_units')
    .select('id, status')
    .eq('organization_id', orgId)
    .eq('building_id', propertyId)

  if (unitsError) {
    return NextResponse.json({ success: false, error: unitsError.message }, { status: 500 })
  }

  const unitIds = (units || []).map((u: any) => u.id)

  const counts = { occupied: 0, vacant: 0, maintenance: 0, notice: 0, unknown: 0 }
  for (const u of units || []) {
    const s = String((u as any).status || '').toLowerCase()
    if (s === 'occupied') counts.occupied++
    else if (s === 'vacant') counts.vacant++
    else if (s === 'maintenance') counts.maintenance++
    else if (s === 'notice') counts.notice++
    else counts.unknown++
  }
  const totalUnits = (units || []).length
  const occupancyRate = totalUnits ? Math.round(((counts.occupied + counts.notice) / totalUnits) * 100) : 0

  let expenseRows: any[] = []
  try {
    const { data, error } = await admin
      .from('expenses')
      .select('amount, incurred_at, created_at')
      .eq('organization_id', orgId)
      .eq('property_id', propertyId)
      .gte('incurred_at', rangeStart)
      .lte('incurred_at', rangeEnd)
    if (error) throw error
    expenseRows = data || []
  } catch (e: any) {
    const { data, error } = await admin
      .from('expenses')
      .select('amount, incurred_at, created_at')
      .eq('organization_id', orgId)
      .eq('property_id', propertyId)
      .gte('created_at', rangeStart)
      .lte('created_at', rangeEnd)
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    expenseRows = data || []
  }

  const monthlyExpenses: Record<string, number> = {}
  let totalExpenses = 0
  for (const e of expenseRows || []) {
    const amt = Number((e as any).amount || 0) || 0
    totalExpenses += amt
    const d = new Date((e as any).incurred_at || (e as any).created_at)
    const key = monthKeyUTC(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)))
    monthlyExpenses[key] = (monthlyExpenses[key] || 0) + amt
  }

  const paymentStart = yearStart < start ? yearStart : start
  const { data: payments, error: payErr } = await admin
    .from('payments')
    .select(
      `
      amount_paid,
      verified,
      payment_date,
      invoice:invoices!payments_invoice_org_fk (
        invoice_type,
        lease:leases!invoices_lease_org_fk (
          unit_id
        )
      )
    `
    )
    .eq('organization_id', orgId)
    .eq('verified', true)
    .gte('payment_date', toISODate(paymentStart))
    .lte('payment_date', rangeEnd)

  if (payErr) return NextResponse.json({ success: false, error: payErr.message }, { status: 500 })

  const { data: orgUnits, error: orgUnitsErr } = await admin
    .from('apartment_units')
    .select('id, building_id')
    .eq('organization_id', orgId)

  if (orgUnitsErr) return NextResponse.json({ success: false, error: orgUnitsErr.message }, { status: 500 })

  const unitToBuilding = new Map<string, string>()
  ;(orgUnits || []).forEach((u: any) => {
    if (u.id && u.building_id) unitToBuilding.set(u.id, u.building_id)
  })

  const { data: buildings } = await admin
    .from('apartment_buildings')
    .select('id, name')
    .eq('organization_id', orgId)

  const buildingName = new Map<string, string>()
  ;(buildings || []).forEach((b: any) => buildingName.set(b.id, b.name))

  const monthlyPropertyRentIncome: Record<string, number> = {}
  let totalPropertyRentIncome = 0
  let ytdPropertyRentIncome = 0
  const peerRentIncomeByMonth: Record<string, Record<string, number>> = {}

  for (const p of payments || []) {
    const inv: any = (p as any).invoice
    if (!inv || String(inv.invoice_type || '').toLowerCase() !== 'rent') continue

    const lease = inv.lease
    const unitId = lease?.unit_id
    if (!unitId) continue

    const amt = Number((p as any).amount_paid || 0) || 0
    const d = new Date((p as any).payment_date)
    const mKey = monthKeyUTC(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)))
    const inRange = d >= start && d <= end
    const inYtd = d >= yearStart && d <= end

    const bId = unitToBuilding.get(unitId)
    if (bId) {
      peerRentIncomeByMonth[mKey] ||= {}
      peerRentIncomeByMonth[mKey][bId] = (peerRentIncomeByMonth[mKey][bId] || 0) + amt
    }

    if (unitIds.includes(unitId)) {
      if (inRange) {
        totalPropertyRentIncome += amt
        monthlyPropertyRentIncome[mKey] = (monthlyPropertyRentIncome[mKey] || 0) + amt
      }
      if (inYtd) {
        ytdPropertyRentIncome += amt
      }
    }
  }

  const monthsSeries: string[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    monthsSeries.push(monthKeyUTC(d))
  }

  const incomeVsExpenses = monthsSeries.map((mKey) => ({
    month: monthNameShort(mKey),
    income: Math.round((monthlyPropertyRentIncome[mKey] || 0) * 100) / 100,
    expenses: Math.round((monthlyExpenses[mKey] || 0) * 100) / 100,
  }))

  const latestMonthKey = monthsSeries[monthsSeries.length - 1]
  const peerMonth = peerRentIncomeByMonth[latestMonthKey] || {}

  const peerMonthlyIncome = Object.entries(peerMonth)
    .map(([buildingId, income]) => ({
      property: buildingName.get(buildingId) || `${buildingId.slice(0, 8)}…`,
      income: Math.round((Number(income || 0) * 100) / 100),
      building_id: buildingId,
    }))
    .sort((a, b) => b.income - a.income)

  const { data: arrearsRows, error: arrErr } = await admin
    .from('vw_lease_arrears')
    .select('unit_id, arrears_amount')
    .eq('organization_id', orgId)

  if (arrErr) return NextResponse.json({ success: false, error: arrErr.message }, { status: 500 })

  let arrearsAmount = 0
  let defaulters = 0
  for (const r of arrearsRows || []) {
    const unitId = (r as any).unit_id
    if (!unitId || !unitIds.includes(unitId)) continue
    const amt = Number((r as any).arrears_amount || 0) || 0
    if (amt <= 0) continue
    arrearsAmount += amt
    defaulters += 1
  }

  return NextResponse.json({
    success: true,
    data: {
      property,
      range: { start: rangeStart, end: rangeEnd, months },
      kpis: {
        rent_income: totalPropertyRentIncome,
        ytd_rent_income: ytdPropertyRentIncome,
        expenses: totalExpenses,
        net: totalPropertyRentIncome - totalExpenses,
        arrears_amount: arrearsAmount,
        defaulters,
        units: {
          total: totalUnits,
          occupied: counts.occupied,
          vacant: counts.vacant,
          maintenance: counts.maintenance,
          notice: counts.notice,
          occupancy_rate: occupancyRate,
        },
      },
      charts: {
        incomeVsExpenses,
        peerMonthlyIncome,
        peerMonthLabel: latestMonthKey,
      },
    },
  })
}
