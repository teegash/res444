import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

function summarizeLeaseState(lease: any, hasCompletedRenewal: boolean) {
  if (!lease) {
    return {
      status: 'unassigned',
      detail: 'Lease has not been assigned.',
    }
  }

  const today = new Date()
  const start = lease.start_date ? new Date(lease.start_date) : null
  const end = lease.end_date ? new Date(lease.end_date) : null

  if (start && start <= today) {
    if (!end) {
      return {
        status: 'invalid',
        detail: 'Lease end date is missing and must be configured.',
      }
    }
    if (end >= today) {
      return {
        status: 'valid',
        detail: 'Lease is currently active.',
      }
    }
  }

  if (end && end < today) {
    return {
      status: 'expired',
      detail: `Lease ended on ${end.toLocaleDateString()}.`,
    }
  }

  if (start && start > today) {
    const leaseStatus = (lease.status || '').toLowerCase()
    if (leaseStatus === 'renewed' || hasCompletedRenewal) {
      return {
        status: 'renewed',
        detail: `Renewed lease starts on ${start.toLocaleDateString()}.`,
      }
    }
    return {
      status: 'pending',
      detail: `Lease becomes active on ${start.toLocaleDateString()}.`,
    }
  }

  return {
    status: lease.status || 'pending',
    detail: 'Lease status pending verification.',
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    const adminSupabase = createAdminClient()
    let propertyScope: string | null =
      (user.user_metadata as any)?.property_id || (user.user_metadata as any)?.building_id || null
    let userRole: string | null = (user.user_metadata as any)?.role || null

    const { data: membership, error: membershipError } = await adminSupabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError) {
      console.error('[Tenants.GET] membership lookup failed', membershipError)
      return NextResponse.json({ success: false, error: 'Unable to verify organization.' }, { status: 500 })
    }

    if (!membership?.organization_id) {
      return NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 })
    }

    if (membership?.role) userRole = membership.role
    const isCaretaker = userRole === 'caretaker'
    const currencyFormatter = new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    })

    const { data: profiles, error: profileError } = await adminSupabase
      .from('user_profiles')
      .select(
        'id, full_name, phone_number, national_id, profile_picture_url, address, date_of_birth, created_at, role'
      )
      .eq('role', 'tenant')
      .eq('organization_id', membership.organization_id)
      .order('created_at', { ascending: false })

    if (profileError) {
      throw profileError
    }

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    const tenantIds = profiles.map((profile) => profile.id).filter(Boolean)

    const authMap = new Map<string, { email: string | null; created_at: string | null }>()
    if (tenantIds.length > 0) {
      const authResults = await Promise.all(
        tenantIds.map(async (tenantId) => {
          const { data, error } = await adminSupabase.auth.admin.getUserById(tenantId)
          if (error) {
            console.error('[Tenants.GET] Failed to fetch auth user', tenantId, error)
            return null
          }
          return data?.user || null
        })
      )

      for (const user of authResults) {
        if (user) {
          authMap.set(user.id, {
            email: user.email || '',
            created_at: user.created_at || null,
          })
        }
      }
    }

    let leases: any[] = []
    if (tenantIds.length > 0) {
      let leaseQuery = adminSupabase
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
        .eq('organization_id', membership.organization_id)
        .in('status', ['active', 'pending', 'renewed'])
        .in('tenant_user_id', tenantIds)
        .order('start_date', { ascending: false })

      if (isCaretaker && propertyScope) {
        leaseQuery = leaseQuery.eq('unit.apartment_buildings.id', propertyScope)
      }

      const { data, error } = await leaseQuery

      if (error) {
        throw error
      }
      leases = data || []
    }

    if (isCaretaker && propertyScope) {
      const scopedTenantIds = Array.from(
        new Set(leases.map((lease) => lease?.tenant_user_id).filter(Boolean) as string[])
      )
      tenantIds.length = 0
      scopedTenantIds.forEach((id) => tenantIds.push(id))
    }

    let payments: any[] = []
    if (tenantIds.length > 0) {
      const { data, error } = await adminSupabase
        .from('payments')
        .select('tenant_user_id, amount_paid, payment_date, verified')
        .eq('organization_id', membership.organization_id)
        .in('tenant_user_id', tenantIds)
        .order('payment_date', { ascending: false })

      if (error) {
        throw error
      }
      payments = data || []
    }

    const leaseMap = new Map<string, any>()
    for (const lease of leases) {
      if (!lease?.tenant_user_id) continue
      if (!leaseMap.has(lease.tenant_user_id)) {
        leaseMap.set(lease.tenant_user_id, lease)
      }
    }

    const leaseIds = Array.from(
      new Set(Array.from(leaseMap.values()).map((lease) => lease?.id).filter(Boolean) as string[])
    )

    const completedRenewalLeaseIds = new Set<string>()
    if (leaseIds.length > 0) {
      const { data: completedRenewals, error: renewalError } = await adminSupabase
        .from('lease_renewals')
        .select('lease_id')
        .eq('organization_id', membership.organization_id)
        .in('lease_id', leaseIds)
        .eq('status', 'completed')

      if (renewalError) {
        throw renewalError
      }

      for (const renewal of completedRenewals || []) {
        if (renewal?.lease_id) {
          completedRenewalLeaseIds.add(renewal.lease_id)
        }
      }
    }

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
    const lookbackMs = 1000 * 60 * 60 * 24 * 45

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

    const payload = profiles.map((profile: any) => {
      const authUser = authMap.get(profile.id)
      const lease = leaseMap.get(profile.id) || null
      const unit = lease?.unit || null
      const building = unit?.building || null
      const monthlyRentValue =
        lease?.monthly_rent !== null && lease?.monthly_rent !== undefined
          ? Number(lease.monthly_rent)
          : null
      const depositAmountValue =
        lease?.deposit_amount !== null && lease?.deposit_amount !== undefined
          ? Number(lease.deposit_amount)
          : null
      const hasCompletedRenewal = lease?.id ? completedRenewalLeaseIds.has(lease.id) : false
      const leaseSummary = summarizeLeaseState(lease, hasCompletedRenewal)
      const paymentStatus = lease
        ? resolvePaymentStatus(profile.id, monthlyRentValue)
        : {
            status: 'Setup Pending',
            detail: 'Lease details will appear once assigned to a unit.',
            latestPaymentDate: null,
          }

      return {
        lease_id: lease?.id || null,
        tenant_user_id: profile.id,
        full_name: profile.full_name || 'Tenant',
        phone_number: profile.phone_number || '',
        national_id: profile.national_id || '',
        profile_picture_url: profile.profile_picture_url || null,
        address: profile.address || '',
        date_of_birth: profile.date_of_birth || null,
        email: authUser?.email || '',
        created_at: profile.created_at || authUser?.created_at || null,
        lease_status: leaseSummary.status,
        lease_start_date: lease?.start_date || null,
        lease_end_date: lease?.end_date || null,
        monthly_rent: monthlyRentValue,
        deposit_amount: depositAmountValue,
        lease_status_detail: leaseSummary.detail,
        unit: unit
          ? {
              id: unit.id,
              unit_number: unit.unit_number,
              unit_price_category: unit.unit_price_category,
              building_id: building?.id || '',
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

    const scopedPayload =
      isCaretaker && propertyScope
        ? payload.filter((tenant: any) => tenant?.unit?.building_id === propertyScope)
        : payload

    return NextResponse.json({ success: true, data: scopedPayload })
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
