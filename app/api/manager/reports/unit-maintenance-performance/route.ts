import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string | null) {
  return !!value && UUID_RE.test(value)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const yearRaw = searchParams.get('year')
    const propertyId = searchParams.get('propertyId')
    const unitId = searchParams.get('unitId')

    const year = yearRaw ? Number(yearRaw) : new Date().getFullYear()
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ success: false, error: 'Valid year is required.' }, { status: 400 })
    }
    if (propertyId && !isUuid(propertyId)) {
      return NextResponse.json({ success: false, error: 'Invalid propertyId.' }, { status: 400 })
    }
    if (unitId && !isUuid(unitId)) {
      return NextResponse.json({ success: false, error: 'Invalid unitId.' }, { status: 400 })
    }

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
      .select('organization_id, role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError || !membership?.organization_id) {
      return NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 })
    }

    const role = String(membership.role || user.user_metadata?.role || '').toLowerCase()
    if (!['admin', 'manager'].includes(role)) {
      return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 })
    }

    const orgId = membership.organization_id

    let q = admin
      .from('vw_unit_financial_performance_yearly_enriched')
      .select(
        'organization_id, property_id, property_name, unit_id, unit_number, year, rent_collected, maintenance_spend, net_income, maintenance_to_collections_ratio'
      )
      .eq('organization_id', orgId)
      .eq('year', year)

    if (propertyId) q = q.eq('property_id', propertyId)
    if (unitId) q = q.eq('unit_id', unitId)

    q = q
      .order('maintenance_to_collections_ratio', { ascending: false, nullsFirst: false })
      .order('maintenance_spend', { ascending: false })
      .order('rent_collected', { ascending: false })

    const { data, error } = await q
    if (error) throw error

    const rows = (data || []).map((row: any) => ({
      organization_id: row.organization_id,
      property_id: row.property_id,
      property_name: row.property_name,
      unit_id: row.unit_id,
      unit_number: row.unit_number,
      year: Number(row.year),
      rent_collected: Number(row.rent_collected || 0),
      maintenance_spend: Number(row.maintenance_spend || 0),
      other_expenses: 0,
      net_income: Number(row.net_income || 0),
      maintenance_to_collections_ratio:
        row.maintenance_to_collections_ratio === null || row.maintenance_to_collections_ratio === undefined
          ? null
          : Number(row.maintenance_to_collections_ratio),
    }))

    const totalCollected = rows.reduce((sum, item) => sum + (item.rent_collected || 0), 0)
    const totalSpend = rows.reduce((sum, item) => sum + (item.maintenance_spend || 0), 0)
    const scopePropertyId = propertyId || (unitId ? rows[0]?.property_id : null)
    const yearStart = `${year}-01-01`
    const yearEnd = `${year + 1}-01-01`

    let totalOtherExpenses = 0
    try {
      let expQ = admin
        .from('expenses')
        .select('amount, category, incurred_at, created_at, property_id')
        .eq('organization_id', orgId)
        .neq('category', 'maintenance')

      if (scopePropertyId) expQ = expQ.eq('property_id', scopePropertyId)

      const { data: expenses, error: expError } = await expQ
      if (expError) throw expError

      totalOtherExpenses = (expenses || []).reduce((sum, item: any) => {
        const rawDate = item.incurred_at || item.created_at
        if (!rawDate) return sum
        const iso = String(rawDate).slice(0, 10)
        if (iso < yearStart || iso >= yearEnd) return sum
        return sum + Number(item.amount || 0)
      }, 0)
    } catch (expErr) {
      console.warn('[unit-maintenance-performance] other expenses lookup failed', expErr)
    }

    const totalNet = totalCollected - totalSpend - totalOtherExpenses

    const rowsWithOther = rows.map((row) => {
      const share = totalCollected > 0 ? (row.rent_collected || 0) / totalCollected : 0
      const allocatedOther = Number((totalOtherExpenses * share).toFixed(2))
      const adjustedNet = (row.rent_collected || 0) - (row.maintenance_spend || 0) - allocatedOther
      return {
        ...row,
        other_expenses: allocatedOther,
        net_income: adjustedNet,
      }
    })
    const unitsWithZeroCollections = rows.filter((item) => (item.rent_collected || 0) <= 0).length
    const overallRatio = totalCollected > 0 ? totalSpend / totalCollected : null

    return NextResponse.json({
      success: true,
      data: rowsWithOther,
      summary: {
        year,
        units: rows.length,
        total_collected: totalCollected,
        total_maintenance_spend: totalSpend,
        total_other_expenses: totalOtherExpenses,
        total_net_income: totalNet,
        overall_ratio: overallRatio,
        units_with_zero_collections: unitsWithZeroCollections,
      },
    })
  } catch (error) {
    console.error('[unit-maintenance-performance] error', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load maintenance performance report.' },
      { status: 500 }
    )
  }
}
