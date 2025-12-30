import { NextRequest, NextResponse } from 'next/server'
import { normalizeUuid, requireManagerContext } from '../_helpers'

const BUCKET = 'tenant-transitions'
const SIGNED_URL_TTL = 60 * 30

async function signPath(admin: any, path?: string | null) {
  if (!path) return null
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
  if (error) return null
  return data?.signedUrl || null
}

export async function GET(req: NextRequest, ctx: { params: { caseId: string } }) {
  const caseId = normalizeUuid(`${ctx.params.caseId} ${req.nextUrl.pathname}`)
  if (!caseId) return NextResponse.json({ success: false, error: 'Invalid case id.' }, { status: 400 })

  const auth = await requireManagerContext()
  if ((auth as any).error) return (auth as any).error

  try {
    const { admin, organizationId } = auth as any

    const { data: row, error } = await admin
      .from('tenant_transition_cases')
      .select(
        `
        *,
        unit:apartment_units (
          id, unit_number, status,
          building:apartment_buildings (id, name, location)
        )
      `
      )
      .eq('organization_id', organizationId)
      .eq('id', caseId)
      .maybeSingle()

    if (error) throw error
    if (!row) return NextResponse.json({ success: false, error: 'Transition case not found.' }, { status: 404 })

    const { data: events } = await admin
      .from('tenant_transition_events')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('case_id', caseId)
      .order('created_at', { ascending: true })

    const { data: profile } = await admin
      .from('user_profiles')
      .select('id, full_name, phone_number, national_id')
      .eq('organization_id', organizationId)
      .eq('id', row.tenant_user_id)
      .maybeSingle()

    const signed = {
      notice_document_url: await signPath(admin, row.notice_document_url),
      inspection_report_url: await signPath(admin, row.inspection_report_url),
      settlement_statement_url: await signPath(admin, row.settlement_statement_url),
    }

    return NextResponse.json({
      success: true,
      case: {
        ...row,
        tenant: profile
          ? { id: profile.id, full_name: profile.full_name || 'Tenant', phone_number: profile.phone_number || '' }
          : { id: row.tenant_user_id, full_name: 'Tenant', phone_number: '' },
        signed_urls: signed,
      },
      events: events || [],
    })
  } catch (err) {
    console.error('[TenantTransitions.ById.GET] Failed', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to load transition case.' },
      { status: 500 }
    )
  }
}
