import { NextResponse } from 'next/server'
import { getManagerContext } from '@/lib/lease-renewals/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function signedUrlForPath(admin: any, path: string, expiresInSeconds: number) {
  const { data, error } = await admin.storage.from('lease-renewals').createSignedUrl(path, expiresInSeconds)
  if (error) throw error
  return data?.signedUrl || null
}

export async function GET(_req: Request, { params }: { params: { renewalId: string } }) {
  try {
    const ctx = await getManagerContext()
    if ('error' in ctx) return ctx.error

    const { admin, orgId } = ctx
    const renewalId = params.renewalId
    if (!renewalId) {
      return NextResponse.json({ success: false, error: 'Renewal id is required.' }, { status: 400 })
    }

    const { data: renewal, error: renewErr } = await admin
      .from('lease_renewals')
      .select('*')
      .eq('organization_id', orgId)
      .eq('id', renewalId)
      .maybeSingle()

    if (renewErr) throw renewErr
    if (!renewal) {
      return NextResponse.json({ success: false, error: 'Renewal not found.' }, { status: 404 })
    }

    const expiresInSeconds = 10 * 60
    const unsignedPath = (renewal as any).pdf_unsigned_path as string | null
    const tenantSignedPath = (renewal as any).pdf_tenant_signed_path as string | null
    const fullySignedPath = (renewal as any).pdf_fully_signed_path as string | null

    return NextResponse.json({
      success: true,
      data: {
        expiresInSeconds,
        unsignedUrl: unsignedPath ? await signedUrlForPath(admin, unsignedPath, expiresInSeconds) : null,
        tenantSignedUrl: tenantSignedPath ? await signedUrlForPath(admin, tenantSignedPath, expiresInSeconds) : null,
        fullySignedUrl: fullySignedPath ? await signedUrlForPath(admin, fullySignedPath, expiresInSeconds) : null,
      },
    })
  } catch (error) {
    console.error('[ManagerLeaseRenewalLinks] Failed to create links', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create download links.' },
      { status: 500 }
    )
  }
}

