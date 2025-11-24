import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'lease_documents'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: leaseRow, error: leaseError } = await admin
      .from('leases')
      .select('id, lease_agreement_url')
      .eq('tenant_user_id', user.id)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (leaseError) throw leaseError
    if (!leaseRow?.lease_agreement_url) {
      return NextResponse.json({ success: true, url: null })
    }

    const stored = leaseRow.lease_agreement_url as string
    // Derive storage path
    const parts = stored.split(BUCKET + '/')
    const path = parts.length > 1 ? parts.slice(1).join(BUCKET + '/') : stored

    const { data: signedData, error: signedError } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60 * 6) // 6 hours

    if (signedError) {
      console.warn('[TenantLeaseDocument] signed URL generation failed', signedError)
      return NextResponse.json({ success: false, error: 'Unable to generate download link.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, url: signedData?.signedUrl || null })
  } catch (error) {
    console.error('[TenantLeaseDocument] failed', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load lease document.' },
      { status: 500 }
    )
  }
}
