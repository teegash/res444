import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { sendVacancyAlert } from '@/lib/communications/vacancyAlerts'

const MANAGER_ROLES = new Set(['admin', 'manager', 'caretaker'])
const PROFILE_BUCKET = 'profile-pictures'

const extractStoragePath = (raw: string | null | undefined, bucket: string) => {
  if (!raw) return null
  const value = String(raw).trim()
  if (!value) return null
  const marker = `/storage/v1/object/public/${bucket}/`
  const idx = value.indexOf(marker)
  if (idx >= 0) return value.slice(idx + marker.length)
  if (value.startsWith(`${bucket}/`)) return value.slice(bucket.length + 1)
  return value
}

const extractBucketPath = (raw: string | null | undefined) => {
  if (!raw) return null
  const value = String(raw).trim()
  if (!value) return null
  const match = value.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)/)
  if (match) {
    const [, bucket, path] = match
    return { bucket, path: path.split('?')[0] }
  }
  const buckets = ['deposit-slips', 'deposit_slips']
  for (const bucket of buckets) {
    if (value.startsWith(`${bucket}/`)) {
      return { bucket, path: value.slice(bucket.length + 1) }
    }
  }
  return null
}

interface RouteParams {
  params: {
    id: string
  }
}

const parseDataUrl = (value: string) => {
  const matches = value.match(/^data:(.+);base64,(.+)$/)
  if (!matches) return null
  const [, mimeType, base64Data] = matches
  const buffer = Buffer.from(base64Data, 'base64')
  const extension = mimeType.split('/')[1] || 'jpg'
  return { mimeType, buffer, extension }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  let tenantId =
    params?.id ||
    request.nextUrl.searchParams.get('tenantId') ||
    request.nextUrl.searchParams.get('id') ||
    null

  if (!tenantId) {
    const segments = request.nextUrl.pathname.split('/').filter(Boolean)
    tenantId = segments[segments.length - 1] || null
  }

  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Tenant id is required.' }, { status: 400 })
  }

  let summary: any | null = null

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const adminSupabase = createAdminClient()
    const { data: membership } = await adminSupabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .maybeSingle()

    const callerRole = membership?.role ? String(membership.role).toLowerCase() : null

    if (!membership?.organization_id || !callerRole || !MANAGER_ROLES.has(callerRole)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { data: tenantProfile, error: tenantProfileError } = await adminSupabase
      .from('user_profiles')
      .select(
        'id, organization_id, full_name, phone_number, national_id, address, date_of_birth, profile_picture_url, role'
      )
      .eq('id', tenantId)
      .maybeSingle()

    if (tenantProfileError) {
      throw tenantProfileError
    }

    if (!tenantProfile || tenantProfile.role !== 'tenant') {
      return NextResponse.json({ success: false, error: 'Tenant not found.' }, { status: 404 })
    }

    if (tenantProfile.organization_id !== membership.organization_id) {
      return NextResponse.json({ success: false, error: 'Tenant not found in your organization.' }, { status: 404 })
    }

    const { data: authUser } = await adminSupabase.auth.admin.getUserById(tenantId)
    const tenantEmail = authUser?.user?.email || null

    const { data: lease } = await adminSupabase
      .from('leases')
      .select(
        `
        id,
        start_date,
        end_date,
        status,
        monthly_rent,
        deposit_amount,
        unit:apartment_units (
          id,
          unit_number,
          status,
          building:apartment_buildings (
            id,
            name,
            location
          )
        )
      `
      )
      .eq('tenant_user_id', tenantId)
      .eq('organization_id', membership.organization_id)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({
      success: true,
      data: {
        profile: tenantProfile,
        email: tenantEmail,
        lease: lease || null,
      },
    })
  } catch (error) {
    console.error('[Tenants.GET] Failed to load tenant', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load tenant.' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const payload = await request.json().catch(() => ({}))
  const {
    full_name,
    phone_number,
    national_id,
    address,
    date_of_birth,
    tenant_user_id,
    profile_picture_file,
  }: Record<string, string | null | undefined> = payload || {}

  let tenantId = params?.id || tenant_user_id || null
  if (!tenantId) {
    tenantId =
      request.nextUrl.searchParams.get('tenantId') ||
      request.nextUrl.searchParams.get('id') ||
      request.nextUrl.searchParams.get('tenant_user_id') ||
      null
  }
  if (!tenantId) {
    const segments = request.nextUrl.pathname.split('/').filter(Boolean)
    tenantId = segments[segments.length - 1] || null
  }

  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Tenant id is required.' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (
      !full_name &&
      !phone_number &&
      !national_id &&
      !profile_picture_file &&
      typeof address === 'undefined' &&
      typeof date_of_birth === 'undefined'
    ) {
      return NextResponse.json(
        { success: false, error: 'No editable fields were provided.' },
        { status: 400 }
      )
    }

    const adminSupabase = createAdminClient()
    const { data: membership } = await adminSupabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .maybeSingle()

    const callerRole = membership?.role ? String(membership.role).toLowerCase() : null

    if (!membership?.organization_id || !callerRole || !MANAGER_ROLES.has(callerRole)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { data: tenantProfile, error: tenantProfileError } = await adminSupabase
      .from('user_profiles')
      .select('id, organization_id, role, profile_picture_url')
      .eq('id', tenantId)
      .maybeSingle()

    if (tenantProfileError) {
      throw tenantProfileError
    }

    if (!tenantProfile || tenantProfile.organization_id !== membership.organization_id || tenantProfile.role !== 'tenant') {
      return NextResponse.json({ success: false, error: 'Tenant not found in your organization.' }, { status: 404 })
    }

    const profileUpdate: Record<string, string | null | undefined> = {}
    if (full_name !== undefined) profileUpdate.full_name = full_name
    if (phone_number !== undefined) profileUpdate.phone_number = phone_number
    if (national_id !== undefined) profileUpdate.national_id = national_id
    if (address !== undefined) profileUpdate.address = address ?? null
    if (date_of_birth !== undefined) profileUpdate.date_of_birth = date_of_birth || null

    if (typeof profile_picture_file === 'string' && profile_picture_file.startsWith('data:')) {
      const parsed = parseDataUrl(profile_picture_file)
      if (parsed) {
        const filePath = `tenant-profiles/${tenantId}-${Date.now()}.${parsed.extension}`
        const { error: uploadError } = await adminSupabase.storage
          .from(PROFILE_BUCKET)
          .upload(filePath, parsed.buffer, {
            contentType: parsed.mimeType,
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadError) {
          throw uploadError
        }

        const { data: publicUrlData } = adminSupabase.storage.from(PROFILE_BUCKET).getPublicUrl(filePath)
        profileUpdate.profile_picture_url = publicUrlData?.publicUrl || null

        const existingPath = extractStoragePath(tenantProfile?.profile_picture_url, PROFILE_BUCKET)
        if (existingPath) {
          await adminSupabase.storage.from(PROFILE_BUCKET).remove([existingPath])
        }
      }
    }

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await adminSupabase
        .from('user_profiles')
        .update(profileUpdate)
        .eq('id', tenantId)
        .eq('organization_id', membership.organization_id)

      if (profileError) {
        throw profileError
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Tenants.PUT] Failed to update tenant', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update tenant.' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  // Accept id from route, query, body, or path parsing (defensive)
  let tenantId =
    params?.id ||
    request.nextUrl.searchParams.get('tenantId') ||
    request.nextUrl.searchParams.get('id') ||
    request.nextUrl.searchParams.get('tenant_user_id') ||
    request.headers.get('x-tenant-id') ||
    null

  if (!tenantId) {
    // Try to parse from pathname (last segment)
    const segments = request.nextUrl.pathname.split('/').filter(Boolean)
    tenantId = segments[segments.length - 1] || null
  }

  if (!tenantId) {
    try {
      const body = await request.json().catch(() => null)
      tenantId = body?.tenant_id || body?.tenant_user_id || body?.id || null
    } catch {
      // ignore body parsing errors
    }
  }

  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Tenant id is required.' }, { status: 400 })
  }

  try {
    // Ensure caller is manager/admin/caretaker based on membership (more reliable than metadata)
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const adminSupabase = createAdminClient()

    // Check membership/role with service role to avoid RLS issues
    const { data: membership, error: membershipError } = await adminSupabase
      .from('organization_members')
      .select('role, organization_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const callerRole =
      membership?.role ||
      (user.user_metadata as any)?.role ||
      (user as any)?.role ||
      null

    if (membershipError) {
      console.warn('[Tenants.DELETE] Failed to read membership for caller:', membershipError.message)
    }

    if (!callerRole || !MANAGER_ROLES.has(String(callerRole).toLowerCase())) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    // Validate tenant record exists and is a tenant (user_profiles role)
    const { data: tenantProfile, error: tenantProfileError } = await adminSupabase
      .from('user_profiles')
      .select('id, role, organization_id, profile_picture_url')
      .eq('id', tenantId)
      .maybeSingle()

    if (tenantProfileError) {
      console.warn('[Tenants.DELETE] Failed to read tenant profile:', tenantProfileError.message)
    }

    if (
      !tenantProfile ||
      tenantProfile.role !== 'tenant' ||
      tenantProfile.organization_id !== membership?.organization_id
    ) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found or not a tenant role.' },
        { status: 404 }
      )
    }

    summary = {
      tenant_id: tenantId,
      organization_id: membership?.organization_id || null,
      counts: {
        lease_renewal_events: 0,
        lease_renewals: 0,
        leases: 0,
        invoices: 0,
        payments: 0,
        reminders: 0,
        maintenance_requests: 0,
        maintenance_expenses: 0,
        water_bills_by_unit: 0,
        water_bills_by_invoice: 0,
        communications: 0,
        tenant_transition_cases: 0,
        tenant_transition_events: 0,
        vacate_notices: 0,
        vacate_notice_events: 0,
        import_batches: 0,
        import_rows: 0,
        tenant_archives: 0,
        tenant_archive_events: 0,
        organization_memberships: 0,
        user_profiles: 0,
        auth_user: 0,
      },
      storage: {
        lease_renewals: 0,
        lease_documents: 0,
        maintenance_attachments: 0,
        transition_docs: 0,
        vacate_notice_docs: 0,
        deposit_slips: 0,
        profile_picture: 0,
      },
      errors: [] as Array<{ step: string; message: string }>,
    }

    const recordError = (step: string, err: unknown) => {
      if (!summary) return
      const message = err instanceof Error ? err.message : String(err)
      summary.errors.push({ step, message })
      console.warn(`[Tenants.DELETE] ${step} failed:`, message)
    }

    // Fetch leases up-front (used for dependent deletes and unit vacate)
    const leaseIds: string[] = []
    const unitIds: string[] = []
    const { data: leases } = await adminSupabase
      .from('leases')
      .select('id, unit_id, lease_agreement_url')
      .eq('tenant_user_id', tenantId)
      .eq('organization_id', membership?.organization_id || '')
    leases?.forEach((row) => {
      if (row.id) leaseIds.push(row.id)
      if ((row as any).unit_id) unitIds.push((row as any).unit_id)
    })

    const leaseDocPaths = (leases || [])
      .map((row: any) => extractStoragePath(row.lease_agreement_url, 'lease-documents'))
      .filter(Boolean) as string[]

    const { data: maintenanceRows } = await adminSupabase
      .from('maintenance_requests')
      .select('id, attachment_urls')
      .eq('tenant_user_id', tenantId)
      .eq('organization_id', membership?.organization_id || '')

    const maintenanceRequestIds = (maintenanceRows || [])
      .map((row: any) => row.id)
      .filter(Boolean) as string[]
    const maintenanceAttachmentPaths = (maintenanceRows || [])
      .flatMap((row: any) => row.attachment_urls || [])
      .map((path: string) => extractStoragePath(path, 'maintenance-attachments'))
      .filter(Boolean) as string[]

    const { data: transitionCases } = await adminSupabase
      .from('tenant_transition_cases')
      .select('id, notice_document_url, inspection_report_url, settlement_statement_url')
      .eq('tenant_user_id', tenantId)
      .eq('organization_id', membership?.organization_id || '')

    const transitionCaseIds = (transitionCases || []).map((row: any) => row.id).filter(Boolean) as string[]
    const transitionDocPaths = (transitionCases || [])
      .flatMap((row: any) => [
        row.notice_document_url,
        row.inspection_report_url,
        row.settlement_statement_url,
      ])
      .map((path: string) => extractStoragePath(path, 'tenant-transitions'))
      .filter(Boolean) as string[]

    const { data: vacateNotices } = await adminSupabase
      .from('tenant_vacate_notices')
      .select('id, notice_document_url')
      .eq('tenant_user_id', tenantId)
      .eq('organization_id', membership?.organization_id || '')

    const vacateNoticeIds = (vacateNotices || []).map((row: any) => row.id).filter(Boolean) as string[]
    const vacateNoticePaths = (vacateNotices || [])
      .map((row: any) => extractStoragePath(row.notice_document_url, 'tenant-notices'))
      .filter(Boolean) as string[]

    const { data: invoiceRows } = leaseIds.length
      ? await adminSupabase
          .from('invoices')
          .select('id')
          .in('lease_id', leaseIds)
      : { data: [] }
    const invoiceIds = (invoiceRows || []).map((row: any) => row.id).filter(Boolean) as string[]

    const { data: renewalRows } = await adminSupabase
      .from('lease_renewals')
      .select('id, lease_id, pdf_unsigned_path, pdf_tenant_signed_path, pdf_fully_signed_path')
      .eq('tenant_user_id', tenantId)
      .eq('organization_id', membership?.organization_id || '')

    const { data: importBatchRows } = await adminSupabase
      .from('tenant_past_data_import_batches')
      .select('id')
      .eq('tenant_user_id', tenantId)
      .eq('organization_id', membership?.organization_id || '')

    const importBatchIds = (importBatchRows || []).map((row: any) => row.id).filter(Boolean)

    const renewalIds = (renewalRows || []).map((row: any) => row.id).filter(Boolean)
    const renewalPaths = (renewalRows || [])
      .flatMap((row: any) => [row.pdf_unsigned_path, row.pdf_tenant_signed_path, row.pdf_fully_signed_path])
      .filter(Boolean) as string[]

    if (renewalIds.length) {
      const { data: renewalEvents, error: renewalEventsError } = await adminSupabase
        .from('lease_renewal_events')
        .delete()
        .in('renewal_id', renewalIds)
        .select('id')
      if (renewalEventsError) {
        recordError('lease_renewal_events', renewalEventsError)
      } else {
        summary.counts.lease_renewal_events = renewalEvents?.length || 0
      }
    }

    if (renewalPaths.length) {
      const { error: storageError } = await adminSupabase.storage
        .from('lease-renewals')
        .remove(renewalPaths)
      if (storageError) {
        recordError('storage.lease_renewals', storageError)
      } else {
        summary.storage.lease_renewals = renewalPaths.length
      }
    }

    if (renewalIds.length) {
      const { data: renewalsDeleted, error: renewalsError } = await adminSupabase
        .from('lease_renewals')
        .delete()
        .in('id', renewalIds)
        .select('id')
      if (renewalsError) {
        recordError('lease_renewals', renewalsError)
      } else {
        summary.counts.lease_renewals = renewalsDeleted?.length || 0
      }
    }

    if (leaseDocPaths.length) {
      const { error: leaseDocError } = await adminSupabase.storage
        .from('lease-documents')
        .remove(leaseDocPaths)
      if (leaseDocError) {
        recordError('storage.lease_documents', leaseDocError)
      } else {
        summary.storage.lease_documents = leaseDocPaths.length
      }
    }

    if (maintenanceAttachmentPaths.length) {
      const { error: attachError } = await adminSupabase.storage
        .from('maintenance-attachments')
        .remove(maintenanceAttachmentPaths)
      if (attachError) {
        recordError('storage.maintenance_attachments', attachError)
      } else {
        summary.storage.maintenance_attachments = maintenanceAttachmentPaths.length
      }
    }

    if (transitionDocPaths.length) {
      const { error: transitionDocError } = await adminSupabase.storage
        .from('tenant-transitions')
        .remove(transitionDocPaths)
      if (transitionDocError) {
        recordError('storage.transition_docs', transitionDocError)
      } else {
        summary.storage.transition_docs = transitionDocPaths.length
      }
    }

    if (vacateNoticePaths.length) {
      const { error: noticeDocError } = await adminSupabase.storage
        .from('tenant-notices')
        .remove(vacateNoticePaths)
      if (noticeDocError) {
        recordError('storage.vacate_notice_docs', noticeDocError)
      } else {
        summary.storage.vacate_notice_docs = vacateNoticePaths.length
      }
    }

    const { data: paymentRows } = await adminSupabase
      .from('payments')
      .select('id, deposit_slip_url')
      .eq('tenant_user_id', tenantId)
      .eq('organization_id', membership?.organization_id || '')

    const depositSlipByBucket = new Map<string, Set<string>>()
    for (const row of paymentRows || []) {
      const parsed = extractBucketPath((row as any).deposit_slip_url)
      if (!parsed?.bucket || !parsed?.path) continue
      if (!depositSlipByBucket.has(parsed.bucket)) {
        depositSlipByBucket.set(parsed.bucket, new Set())
      }
      depositSlipByBucket.get(parsed.bucket)?.add(parsed.path)
    }

    let depositSlipRemoved = 0
    for (const [bucket, paths] of depositSlipByBucket.entries()) {
      const list = Array.from(paths)
      if (!list.length) continue
      const { error: slipError } = await adminSupabase.storage.from(bucket).remove(list)
      if (slipError) {
        recordError('storage.deposit_slips', slipError)
      } else {
        depositSlipRemoved += list.length
      }
    }
    if (depositSlipRemoved > 0) {
      summary.storage.deposit_slips = depositSlipRemoved
    }

    const profilePicturePath = extractStoragePath(tenantProfile?.profile_picture_url, 'profile-pictures')
    if (profilePicturePath) {
      const { error: profilePicError } = await adminSupabase.storage
        .from('profile-pictures')
        .remove([profilePicturePath])
      if (profilePicError) {
        recordError('storage.profile_picture', profilePicError)
      } else {
        summary.storage.profile_picture = 1
      }
    }

    if (transitionCaseIds.length) {
      const { data: transitionEvents, error: transitionEventsError } = await adminSupabase
        .from('tenant_transition_events')
        .delete()
        .in('case_id', transitionCaseIds)
        .select('id')
      if (transitionEventsError) {
        recordError('tenant_transition_events', transitionEventsError)
      } else {
        summary.counts.tenant_transition_events = transitionEvents?.length || 0
      }

      const { data: transitionDeleted, error: transitionDeleteError } = await adminSupabase
        .from('tenant_transition_cases')
        .delete()
        .in('id', transitionCaseIds)
        .select('id')
      if (transitionDeleteError) {
        recordError('tenant_transition_cases', transitionDeleteError)
      } else {
        summary.counts.tenant_transition_cases = transitionDeleted?.length || 0
      }
    }

    if (vacateNoticeIds.length) {
      const { data: vacateEvents, error: vacateEventsError } = await adminSupabase
        .from('tenant_vacate_notice_events')
        .delete()
        .in('notice_id', vacateNoticeIds)
        .select('id')
      if (vacateEventsError) {
        recordError('tenant_vacate_notice_events', vacateEventsError)
      } else {
        summary.counts.vacate_notice_events = vacateEvents?.length || 0
      }

      const { data: vacateDeleted, error: vacateDeleteError } = await adminSupabase
        .from('tenant_vacate_notices')
        .delete()
        .in('id', vacateNoticeIds)
        .select('id')
      if (vacateDeleteError) {
        recordError('tenant_vacate_notices', vacateDeleteError)
      } else {
        summary.counts.vacate_notices = vacateDeleted?.length || 0
      }
    }

    if (leaseIds.length) {
      const { data: remindersDeleted, error: reminderError } = await adminSupabase
        .from('reminders')
        .delete()
        .eq('reminder_type', 'lease_renewal')
        .eq('related_entity_type', 'lease')
        .in('related_entity_id', leaseIds)
        .select('id')
      if (reminderError) {
        recordError('reminders', reminderError)
      } else {
        summary.counts.reminders = remindersDeleted?.length || 0
      }
    }

    if (maintenanceRequestIds.length) {
      const { data: expenseDeleted, error: maintExpenseError } = await adminSupabase
        .from('expenses')
        .delete()
        .in('maintenance_request_id', maintenanceRequestIds)
        .select('id')
      if (maintExpenseError) {
        recordError('maintenance_expenses', maintExpenseError)
      } else {
        summary.counts.maintenance_expenses = expenseDeleted?.length || 0
      }
    }

    if (importBatchIds.length) {
      const { data: importRowsDeleted, error: importRowsError } = await adminSupabase
        .from('tenant_past_data_import_rows')
        .delete()
        .in('batch_id', importBatchIds)
        .select('id')
      if (importRowsError) {
        recordError('import_rows', importRowsError)
      } else {
        summary.counts.import_rows = importRowsDeleted?.length || 0
      }

      const { data: importBatchDeleted, error: importBatchError } = await adminSupabase
        .from('tenant_past_data_import_batches')
        .delete()
        .in('id', importBatchIds)
        .select('id')
      if (importBatchError) {
        recordError('import_batches', importBatchError)
      } else {
        summary.counts.import_batches = importBatchDeleted?.length || 0
      }
    }

    const { data: archiveEventsDeleted, error: archiveEventsError } = await adminSupabase
      .from('tenant_archive_events')
      .delete()
      .eq('tenant_user_id', tenantId)
      .eq('organization_id', membership?.organization_id || '')
      .select('id')
    if (archiveEventsError) {
      recordError('tenant_archive_events', archiveEventsError)
    } else {
      summary.counts.tenant_archive_events = archiveEventsDeleted?.length || 0
    }

    const { data: archiveDeleted, error: archiveError } = await adminSupabase
      .from('tenant_archives')
      .delete()
      .eq('tenant_user_id', tenantId)
      .eq('organization_id', membership?.organization_id || '')
      .select('id')
    if (archiveError) {
      recordError('tenant_archives', archiveError)
    } else {
      summary.counts.tenant_archives = archiveDeleted?.length || 0
    }

    if (unitIds.length) {
      const { data: waterBillsUnitDeleted, error: waterBillUnitError } = await adminSupabase
        .from('water_bills')
        .delete()
        .in('unit_id', unitIds)
        .eq('organization_id', membership?.organization_id || '')
        .select('id')
      if (waterBillUnitError) {
        recordError('water_bills_by_unit', waterBillUnitError)
      } else {
        summary.counts.water_bills_by_unit = waterBillsUnitDeleted?.length || 0
      }
    }

    if (invoiceIds.length) {
      const { data: waterBillsInvoiceDeleted, error: waterBillInvoiceError } = await adminSupabase
        .from('water_bills')
        .delete()
        .in('added_to_invoice_id', invoiceIds)
        .eq('organization_id', membership?.organization_id || '')
        .select('id')
      if (waterBillInvoiceError) {
        recordError('water_bills_by_invoice', waterBillInvoiceError)
      } else {
        summary.counts.water_bills_by_invoice = waterBillsInvoiceDeleted?.length || 0
      }
    }

    // Hard-delete dependent financial data first to remove revenue traces
    const { data: paymentsDeleted, error: paymentsError } = await adminSupabase
      .from('payments')
      .delete()
      .eq('tenant_user_id', tenantId)
      .eq('organization_id', membership?.organization_id || '')
      .select('id')
    if (paymentsError) {
      recordError('payments', paymentsError)
    } else {
      summary.counts.payments = paymentsDeleted?.length || 0
    }

    if (leaseIds.length) {
      const { data: invoicesDeleted, error: invoiceError } = await adminSupabase
        .from('invoices')
        .delete()
        .in('lease_id', leaseIds)
        .select('id')
      if (invoiceError) {
        recordError('invoices', invoiceError)
      } else {
        summary.counts.invoices = invoicesDeleted?.length || 0
      }
    }

    if (leaseIds.length) {
      const { data: leasesDeleted, error: leaseDeleteError } = await adminSupabase
        .from('leases')
        .delete()
        .in('id', leaseIds)
        .eq('organization_id', membership?.organization_id || '')
        .select('id')
      if (leaseDeleteError) {
        recordError('leases', leaseDeleteError)
      } else {
        summary.counts.leases = leasesDeleted?.length || 0
      }
    } else {
      const { data: leasesDeleted, error: leaseDeleteError } = await adminSupabase
        .from('leases')
        .delete()
        .eq('tenant_user_id', tenantId)
        .eq('organization_id', membership?.organization_id || '')
        .select('id')
      if (leaseDeleteError) {
        recordError('leases', leaseDeleteError)
      } else {
        summary.counts.leases = leasesDeleted?.length || 0
      }
    }

    // Communications, maintenance, org membership, profile
    const { data: commsDeleted, error: commsError } = await adminSupabase
      .from('communications')
      .delete()
      .or(`sender_user_id.eq.${tenantId},recipient_user_id.eq.${tenantId}`)
      .eq('organization_id', membership?.organization_id || '')
      .select('id')
    if (commsError) {
      recordError('communications', commsError)
    } else {
      summary.counts.communications = commsDeleted?.length || 0
    }

    const { data: maintDeleted, error: maintError } = await adminSupabase
      .from('maintenance_requests')
      .delete()
      .eq('tenant_user_id', tenantId)
      .eq('organization_id', membership?.organization_id || '')
      .select('id')
    if (maintError) {
      recordError('maintenance_requests', maintError)
    } else {
      summary.counts.maintenance_requests = maintDeleted?.length || 0
    }

    const { data: orgDeleted, error: orgError } = await adminSupabase
      .from('organization_members')
      .delete()
      .eq('user_id', tenantId)
      .select('id')
    if (orgError) {
      recordError('organization_memberships', orgError)
    } else {
      summary.counts.organization_memberships = orgDeleted?.length || 0
    }

    const { data: profileDeleted, error: profileError } = await adminSupabase
      .from('user_profiles')
      .delete()
      .eq('id', tenantId)
      .select('id')
    if (profileError) {
      recordError('user_profiles', profileError)
    } else {
      summary.counts.user_profiles = profileDeleted?.length || 0
    }

    let unitsToAlert: Array<{
      id: string
      unit_number: string | null
      status: string | null
      building: { id: string; name: string | null; vacancy_alerts_enabled: boolean | null } | null
    }> = []

    // Vacate units that were occupied by this tenant
    if (unitIds.length) {
      const { data: unitRows } = await adminSupabase
        .from('apartment_units')
        .select(
          `
          id,
          unit_number,
          status,
          building:apartment_buildings (
            id,
            name,
            vacancy_alerts_enabled
          )
        `
        )
        .in('id', unitIds)
        .eq('organization_id', membership?.organization_id || '')

      unitsToAlert = (unitRows || []) as any[]

      const { error: unitError } = await adminSupabase
        .from('apartment_units')
        .update({ status: 'vacant' })
        .in('id', unitIds)
      if (unitError) {
        recordError('vacate_units', unitError)
      }
    }

    // Finally, remove the auth user (cascades to tables with FK ON DELETE CASCADE)
    const { error } = await adminSupabase.auth.admin.deleteUser(tenantId)
    if (error && error.status !== 404) {
      recordError('auth_user', error)
    } else {
      summary.counts.auth_user = 1
    }

    for (const unit of unitsToAlert) {
      if (!unit?.building?.vacancy_alerts_enabled || !unit?.building?.id) continue
      const priorStatus = String(unit.status || '').toLowerCase()
      if (priorStatus !== 'occupied') continue
      await sendVacancyAlert({
        adminSupabase,
        organizationId: membership?.organization_id || '',
        buildingId: unit.building.id,
        buildingName: unit.building.name || undefined,
        unitNumber: unit.unit_number,
        actorUserId: user?.id || null,
      })
    }

    const success = summary.errors.length === 0
    return NextResponse.json(
      { success, summary, errors: summary.errors },
      { status: success ? 200 : 500 }
    )
  } catch (error) {
    console.error('[Tenants.DELETE] Failed to delete tenant', error)
    if (summary) {
      const message = error instanceof Error ? error.message : 'Failed to delete tenant.'
      summary.errors.push({ step: 'fatal', message })
      return NextResponse.json({ success: false, error: message, summary, errors: summary.errors }, { status: 500 })
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete tenant.' },
      { status: 500 }
    )
  }
}
