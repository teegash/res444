import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const adminSupabase = createAdminClient()
    const currencyFormatter = new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    })

    const { data: leases, error: leaseError } = await adminSupabase
      .from('leases')
      .select(
        `
        id,
        tenant_user_id,
        status,
        start_date,
        end_date,
        monthly_rent,
        deposit_amount,
        created_at,
        unit:apartment_units (
          id,
          unit_number,
          unit_price_category,
          building:apartment_buildings (
            id,
            name,
            location
          )
        )
      `
      )
      .eq('status', 'active')
      .order('start_date', { ascending: false })

    if (leaseError) {
      throw leaseError
    }

    if (!leases || leases.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    const tenantIds = Array.from(
      new Set(
        leases
          .map((lease) => lease.tenant_user_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    )

    let profiles: any[] = []
    if (tenantIds.length > 0) {
      const { data, error } = await adminSupabase
        .from('user_profiles')
        .select('id, full_name, phone_number, national_id, profile_picture_url, address, date_of_birth, created_at, updated_at')
        .in('id', tenantIds)

      if (error) {
        throw error
      }
      profiles = data || []
    }

    let authUsers: any[] = []
    if (tenantIds.length > 0) {
      const { data, error } = await adminSupabase
        .from('auth.users')
        .select('id, email, created_at')
        .in('id', tenantIds)

      if (error) {
        throw error
      }
      authUsers = data || []
    }

    let payments: any[] = []
    if (tenantIds.length > 0) {
      const { data, error } = await adminSupabase
        .from('payments')
        .select('tenant_user_id, amount_paid, payment_date, verified')
        .in('tenant_user_id', tenantIds)
        .order('payment_date', { ascending: false })

      if (error) {
        throw error
      }
      payments = data || []
    }

    const profileMap = new Map((profiles || []).map((profile: any) => [profile.id, profile]))
    const authMap = new Map((authUsers || []).map((user: any) => [user.id, user]))
    const paymentAggregates = new Map<
      string,
      {
        latestPaymentDate: string | null
        latestPaymentAmount: number
        verifiedRecentTotal: number
        hasUnverified: boolean
      }
    >()

    const now = Date.now()
    const lookbackMs = 1000 * 60 * 60 * 24 * 45 // roughly 1.5 months

    for (const payment of payments) {
      const tenantId = payment.tenant_user_id
      if (!tenantId) continue
      const aggregate =
        paymentAggregates.get(tenantId) || {
          latestPaymentDate: null,
          latestPaymentAmount: 0,
          verifiedRecentTotal: 0,
          hasUnverified: false,
        }
      const paymentDate = payment.payment_date ? new Date(payment.payment_date).getTime() : null
      const amount = Number(payment.amount_paid || 0)

      if (paymentDate !== null) {
        const currentLatestTime = aggregate.latestPaymentDate
          ? new Date(aggregate.latestPaymentDate).getTime()
          : null
        if (currentLatestTime === null || paymentDate > currentLatestTime) {
          aggregate.latestPaymentDate = payment.payment_date
          aggregate.latestPaymentAmount = amount
        }
      }

      if (payment.verified) {
        if (paymentDate !== null && now - paymentDate <= lookbackMs) {
          aggregate.verifiedRecentTotal += amount
        }
      } else {
        aggregate.hasUnverified = true
      }

      paymentAggregates.set(tenantId, aggregate)
    }

    const resolvePaymentStatus = (tenantId: string, monthlyRent: number | null) => {
      const aggregate = paymentAggregates.get(tenantId)
      if (!aggregate) {
        return {
          status: 'Unpaid',
          detail: 'No payments found for this tenant yet.',
          latestPaymentDate: null,
        }
      }

      const rent = monthlyRent || 0

      if (rent > 0 && aggregate.verifiedRecentTotal >= rent) {
        return {
          status: 'Paid',
          detail: `Verified payments in the last 45 days total ${currencyFormatter.format(
            aggregate.verifiedRecentTotal
          )}.`,
          latestPaymentDate: aggregate.latestPaymentDate,
        }
      }

      if (aggregate.hasUnverified) {
        return {
          status: 'Pending Verification',
          detail: 'Tenant has submitted a payment that is awaiting verification.',
          latestPaymentDate: aggregate.latestPaymentDate,
        }
      }

      if (aggregate.verifiedRecentTotal > 0) {
        return {
          status: 'Partial',
          detail: `Recent verified payments add up to ${currencyFormatter.format(
            aggregate.verifiedRecentTotal
          )}.`,
          latestPaymentDate: aggregate.latestPaymentDate,
        }
      }

      return {
        status: 'Unpaid',
        detail: 'No verified payments recorded in the last 45 days.',
        latestPaymentDate: aggregate.latestPaymentDate,
      }
    }

    const payload = leases.map((lease: any) => {
      const profile = profileMap.get(lease.tenant_user_id)
      const authUser = authMap.get(lease.tenant_user_id)
      const unit = lease.unit || null
      const building = unit?.building || null
      const monthlyRentValue =
        lease.monthly_rent !== null && lease.monthly_rent !== undefined
          ? Number(lease.monthly_rent)
          : null
      const depositAmountValue =
        lease.deposit_amount !== null && lease.deposit_amount !== undefined
          ? Number(lease.deposit_amount)
          : null
      const paymentStatus = resolvePaymentStatus(lease.tenant_user_id, monthlyRentValue)

      return {
        lease_id: lease.id,
        tenant_user_id: lease.tenant_user_id,
        full_name: profile?.full_name || 'Tenant',
        phone_number: profile?.phone_number || '',
        national_id: profile?.national_id || '',
        profile_picture_url: profile?.profile_picture_url || null,
        address: profile?.address || '',
        date_of_birth: profile?.date_of_birth || null,
        email: authUser?.email || '',
        created_at: profile?.created_at || authUser?.created_at || null,
        lease_status: lease.status || 'active',
        lease_start_date: lease.start_date || null,
        lease_end_date: lease.end_date || null,
        monthly_rent: monthlyRentValue,
        deposit_amount: depositAmountValue,
        unit: unit
          ? {
              id: unit.id,
              unit_number: unit.unit_number,
              unit_price_category: unit.unit_price_category,
              building_name: building?.name || '',
              building_location: building?.location || '',
            }
          : null,
        unit_label: unit
          ? `${unit.unit_number}${building?.name ? ` - ${building.name}` : ''}`
          : 'Unassigned',
        payment_status: paymentStatus.status,
        payment_status_detail: paymentStatus.detail,
        last_payment_date: paymentStatus.latestPaymentDate,
      }
    })

    return NextResponse.json({ success: true, data: payload })
  } catch (error) {
    console.error('[Tenants.GET] Failed to fetch tenants', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch tenants.',
      },
      { status: 500 }
    )
  }
}
