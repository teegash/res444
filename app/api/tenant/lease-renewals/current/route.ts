import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/lib/lease-renewals/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function signedUrlForPath(admin: any, path: string, expiresInSeconds: number) {
  const { data, error } = await admin.storage.from('lease-renewals').createSignedUrl(path, expiresInSeconds)
  if (error) throw error
  return data?.signedUrl || null
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantContext()
    if ('error' in ctx) return ctx.error

    const { admin, orgId, userId } = ctx
    const requestedLeaseId = request.nextUrl.searchParams.get('leaseId')?.trim() || null

    let leaseId = requestedLeaseId
    if (!leaseId) {
      const { data: lease, error: leaseErr } = await admin
        .from('leases')
        .select('id')
        .eq('organization_id', orgId)
        .eq('tenant_user_id', userId)
        .in('status', ['active', 'pending'])
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (leaseErr) throw leaseErr
      leaseId = (lease as any)?.id || null
    }

    if (!leaseId) {
      return NextResponse.json({ success: true, data: null })
    }

    const { data: renewal, error: renewErr } = await admin
      .from('lease_renewals')
      .select('*')
      .eq('organization_id', orgId)
      .eq('lease_id', leaseId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (renewErr) throw renewErr
    if (!renewal) {
      return NextResponse.json({ success: true, data: null })
    }

    if ((renewal as any).tenant_user_id !== userId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const expiresInSeconds = 10 * 60
    const unsignedPath = (renewal as any).pdf_unsigned_path as string | null
    const tenantSignedPath = (renewal as any).pdf_tenant_signed_path as string | null
    const fullySignedPath = (renewal as any).pdf_fully_signed_path as string | null

    const unsignedUrl = unsignedPath ? await signedUrlForPath(admin, unsignedPath, expiresInSeconds) : null
    const tenantSignedUrl = tenantSignedPath ? await signedUrlForPath(admin, tenantSignedPath, expiresInSeconds) : null
    const fullySignedUrl = fullySignedPath ? await signedUrlForPath(admin, fullySignedPath, expiresInSeconds) : null

    return NextResponse.json({
      success: true,
      data: {
        ...renewal,
        links: {
          expiresInSeconds,
          unsignedUrl,
          tenantSignedUrl,
          fullySignedUrl,
        },
      },
    })
  } catch (error) {
    console.error('[TenantLeaseRenewalCurrent] Failed to load renewal', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load lease renewal.' },
      { status: 500 }
    )
  }
}

