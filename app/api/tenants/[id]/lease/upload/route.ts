'use server'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MANAGER_ROLES = new Set(['admin', 'manager', 'caretaker'])
const BUCKET = 'lease-documents'

async function verifyManager() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }
  }

  const role = (user.user_metadata?.role as string | undefined)?.toLowerCase()
  if (!role || !MANAGER_ROLES.has(role)) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Access denied. Manager permissions required.' },
        { status: 403 }
      ),
    }
  }

  return { user }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const tenantIdParam = params?.id || request.nextUrl.searchParams.get('tenantId') || ''

  const auth = await verifyManager()
  if (auth.error) return auth.error

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const leaseIdFromForm = formData.get('lease_id') as string | null
    const tenantIdFromForm = (formData.get('tenant_id') as string | null) || tenantIdParam

    const tenantId = tenantIdFromForm || tenantIdParam
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant id is required.' }, { status: 400 })
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'No file uploaded.' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Find the lease to update
    let targetLeaseId = leaseIdFromForm || ''
    if (!targetLeaseId) {
      const { data: leaseRow } = await admin
        .from('leases')
        .select('id')
        .eq('tenant_user_id', tenantId)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!leaseRow?.id) {
        return NextResponse.json(
          { success: false, error: 'No lease found for tenant.' },
          { status: 404 }
        )
      }
      targetLeaseId = leaseRow.id
    }

    const extension = (file.name?.split('.').pop() || 'pdf').replace(/[^a-z0-9]/gi, '') || 'pdf'
    const filePath = `tenant-${tenantId}/${targetLeaseId}-${Date.now()}.${extension}`

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(filePath, file, {
        contentType: file.type || 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      console.error('[LeaseUpload] storage failed', uploadError)
      return NextResponse.json(
        { success: false, error: uploadError.message || 'Upload failed.' },
        { status: 500 }
      )
    }

    // Store storage path; we will serve signed URLs at download time
    const storagePath = filePath
    const signed = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60 * 6) // 6h
    const signedUrl = signed?.data?.signedUrl || ''

    const { error: updateError } = await admin
      .from('leases')
      .update({ lease_agreement_url: storagePath })
      .eq('id', targetLeaseId)

    if (updateError) {
      console.error('[LeaseUpload] failed to save url', updateError)
      return NextResponse.json(
        { success: false, error: updateError.message || 'Failed to save document.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, url: signedUrl || storagePath, path: storagePath, lease_id: targetLeaseId })
  } catch (error) {
    console.error('[LeaseUpload] unexpected', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to upload lease document.' },
      { status: 500 }
    )
  }
}
