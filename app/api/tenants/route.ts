import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

function parseDateOnly(value?: string | null) {
  if (!value) return null
  const raw = value.trim()
  const base = raw.includes('T') ? raw.split('T')[0] : raw.split(' ')[0]
  const [y, m, d] = base.split('-').map((part) => Number(part))
  if (y && m && d) {
    return new Date(Date.UTC(y, m - 1, d))
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))
}

function addDaysUtc(date: Date, days: number) {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function summarizeLeaseState(
  lease: any,
  renewalStartDate: Date | null,
  hasCompletedRenewal: boolean
) {
  if (!lease) {
    return {
      status: 'unassigned',
      detail: 'Lease has not been assigned.',
    }
  }

  const today = new Date()
  const start = lease.start_date ? new Date(lease.start_date) : null
  const end = lease.end_date ? new Date(lease.end_date) : null

  if (hasCompletedRenewal && renewalStartDate && renewalStartDate > today) {
    return {
      status: 'renewed',
      detail: `Renewed lease starts on ${renewalStartDate.toLocaleDateString()}.`,
    }
  }

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

export async function GET(request: NextRequest) {
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

    const defaultersOnly = request.nextUrl.searchParams.get('defaulters') === '1'

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

    const archiveMap = new Map<string, { archived_at: string | null }>()
    if (tenantIds.length > 0) {
      const { data: archives } = await adminSupabase
        .from('tenant_archives')
        .select('tenant_user_id, archived_at')
        .eq('organization_id', membership.organization_id)
        .eq('is_active', true)
        .in('tenant_user_id', tenantIds)

      ;(archives || []).forEach((row: any) => {
        archiveMap.set(row.tenant_user_id, { archived_at: row.archived_at || null })
      })
    }

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
    const completedRenewalStartMap = new Map<string, string | null>()
    if (leaseIds.length > 0) {
      const { data: completedRenewals, error: renewalError } = await adminSupabase
        .from('lease_renewals')
        .select('lease_id, proposed_start_date, created_at')
        .eq('organization_id', membership.organization_id)
        .in('lease_id', leaseIds)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })

      if (renewalError) {
        throw renewalError
      }

      for (const renewal of completedRenewals || []) {
        if (!renewal?.lease_id) continue
        completedRenewalLeaseIds.add(renewal.lease_id)
        if (!completedRenewalStartMap.has(renewal.lease_id)) {
          completedRenewalStartMap.set(renewal.lease_id, renewal.proposed_start_date || null)
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

    const riskMap = new Map<
      string,
      {
        arrears_amount: number
        open_invoices_count: number
        oldest_due_date: string | null
      }
    >()
    const ratingMap = new Map<string, { rating_percentage: number | null; scored_items_count: number }>()
    const kickoutMap = new Map<
      string,
      { kick_out_candidate: boolean; monthly_rent: number | null }
    >()

    const { data: riskRows } = await adminSupabase
      .from('vw_tenant_risk_summary')
      .select('tenant_user_id, arrears_amount, open_invoices_count, oldest_due_date')
      .eq('organization_id', membership.organization_id)

    ;(riskRows || []).forEach((row: any) => {
      riskMap.set(row.tenant_user_id, {
        arrears_amount: Number(row.arrears_amount || 0),
        open_invoices_count: Number(row.open_invoices_count || 0),
        oldest_due_date: row.oldest_due_date || null,
      })
    })

    const { data: ratingRows } = await adminSupabase
      .from('vw_tenant_payment_timeliness')
      .select('tenant_user_id, rating_percentage, scored_items_count')
      .eq('organization_id', membership.organization_id)

    ;(ratingRows || []).forEach((row: any) => {
      ratingMap.set(row.tenant_user_id, {
        rating_percentage:
          row.rating_percentage === null || row.rating_percentage === undefined
            ? null
            : Number(row.rating_percentage),
        scored_items_count: Number(row.scored_items_count || 0),
      })
    })

    const { data: kickRows } = await adminSupabase
      .from('vw_tenant_kickout_signal')
      .select('tenant_user_id, monthly_rent, kick_out_candidate')
      .eq('organization_id', membership.organization_id)

    ;(kickRows || []).forEach((row: any) => {
      kickoutMap.set(row.tenant_user_id, {
        kick_out_candidate: Boolean(row.kick_out_candidate),
        monthly_rent:
          row.monthly_rent === null || row.monthly_rent === undefined
            ? null
            : Number(row.monthly_rent),
      })
    })

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
      const renewalStartRaw =
        hasCompletedRenewal && lease?.id ? completedRenewalStartMap.get(lease.id) ?? null : null
      const renewalStartParsed = renewalStartRaw ? parseDateOnly(renewalStartRaw) : null
      const leaseEndParsed = hasCompletedRenewal && lease?.end_date ? parseDateOnly(lease.end_date) : null
      const renewalStartFallback =
        hasCompletedRenewal && !renewalStartParsed && leaseEndParsed ? addDaysUtc(leaseEndParsed, 1) : null
      const renewalStartDate = renewalStartParsed || renewalStartFallback
      const leaseSummary = summarizeLeaseState(lease, renewalStartDate, hasCompletedRenewal)
      const paymentStatus = lease
        ? resolvePaymentStatus(profile.id, monthlyRentValue)
        : {
            status: 'Setup Pending',
            detail: 'Lease details will appear once assigned to a unit.',
            latestPaymentDate: null,
          }

      const risk = riskMap.get(profile.id)
      const rating = ratingMap.get(profile.id)
      const kickout = kickoutMap.get(profile.id)
      const archiveMeta = archiveMap.get(profile.id)

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
        arrears_amount: risk?.arrears_amount ?? 0,
        open_invoices_count: risk?.open_invoices_count ?? 0,
        oldest_due_date: risk?.oldest_due_date ?? null,
        rating_percentage: rating?.rating_percentage ?? null,
        scored_items_count: rating?.scored_items_count ?? 0,
        kick_out_candidate: kickout?.kick_out_candidate ?? false,
        kickout_monthly_rent: kickout?.monthly_rent ?? null,
        is_archived: Boolean(archiveMeta),
        archived_at: archiveMeta?.archived_at ?? null,
      }
    })

    const scopedPayload =
      isCaretaker && propertyScope
        ? payload.filter((tenant: any) => tenant?.unit?.building_id === propertyScope)
        : payload

    const filteredPayload = defaultersOnly
      ? scopedPayload.filter((tenant: any) => Number(tenant?.arrears_amount || 0) > 0)
      : scopedPayload

    try {
      const expiredTenants = scopedPayload.filter(
        (tenant: any) => tenant?.lease_status === 'expired' && tenant?.lease_id
      )
      const expiredLeaseIds = new Set<string>(
        expiredTenants.map((tenant: any) => tenant.lease_id).filter(Boolean)
      )

      const { data: managers } = await adminSupabase
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', membership.organization_id)
        .in('role', ['admin', 'manager', 'caretaker'])

      const managerIds =
        managers?.map((profile: any) => profile.user_id).filter((id: string | null) => Boolean(id)) || []

      if (managerIds.length > 0) {
        const { data: existingNotifs } = await adminSupabase
          .from('communications')
          .select('id, recipient_user_id, related_entity_id, read')
          .eq('organization_id', membership.organization_id)
          .eq('related_entity_type', 'lease_expired')
          .in('recipient_user_id', managerIds)

        const existingMap = new Set<string>()
        ;(existingNotifs || []).forEach((row: any) => {
          if (row?.recipient_user_id && row?.related_entity_id) {
            existingMap.add(`${row.recipient_user_id}:${row.related_entity_id}`)
          }
        })

        const rowsToInsert = expiredTenants.flatMap((tenant: any) => {
          const endDate = tenant.lease_end_date
            ? new Date(tenant.lease_end_date).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })
            : 'Unknown'
          const messageText = `Lease expired: ${tenant.full_name} • ${tenant.unit_label} (ended ${endDate}).`
          return managerIds
            .filter((managerId: string) => !existingMap.has(`${managerId}:${tenant.lease_id}`))
            .map((managerId: string) => ({
              sender_user_id: tenant.tenant_user_id,
              recipient_user_id: managerId,
              related_entity_type: 'lease_expired',
              related_entity_id: tenant.lease_id,
              message_text: messageText,
              message_type: 'in_app',
              read: false,
              organization_id: membership.organization_id,
            }))
        })

        if (rowsToInsert.length > 0) {
          await adminSupabase.from('communications').insert(rowsToInsert)
        }

        const reopenIds =
          (existingNotifs || [])
            .filter(
              (row: any) =>
                row?.related_entity_id &&
                expiredLeaseIds.has(row.related_entity_id) &&
                row.read === true
            )
            .map((row: any) => row.id) || []

        if (reopenIds.length > 0) {
          await adminSupabase
            .from('communications')
            .update({ read: false })
            .in('id', reopenIds)
        }

        const clearIds =
          (existingNotifs || [])
            .filter(
              (row: any) =>
                row?.related_entity_id &&
                !expiredLeaseIds.has(row.related_entity_id) &&
                row.read === false
            )
            .map((row: any) => row.id) || []

        if (clearIds.length > 0) {
          await adminSupabase
            .from('communications')
            .update({ read: true })
            .in('id', clearIds)
        }
      }
    } catch (notifyErr) {
      console.error('[Tenants.GET] lease-expired notifications failed', notifyErr)
    }

    return NextResponse.json({ success: true, data: filteredPayload })
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
