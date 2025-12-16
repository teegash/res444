import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TEMPLATE_KEYS, TemplateKey, TEMPLATE_METADATA } from '@/lib/sms/templateMetadata'

const MANAGER_ROLES = new Set(['admin', 'manager'])

async function requireOrg() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const admin = createAdminClient()
  const { data: membership, error: membershipError } = await admin
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError || !membership?.organization_id) {
    return { error: NextResponse.json({ error: 'Organization not found' }, { status: 403 }) }
  }

  const role = membership.role || (user.user_metadata as any)?.role
  if (!role || !MANAGER_ROLES.has(String(role).toLowerCase())) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { admin, organizationId: membership.organization_id, userId: user.id }
}

export async function PUT(req: NextRequest, ctx: { params: { templateKey: string } }) {
  const { templateKey } = ctx.params
  const ctxOrg = await requireOrg()
  if ('error' in ctxOrg) return ctxOrg.error

  const { admin, organizationId, userId } = ctxOrg
  const body = await req.json().catch(() => ({}))
  const content = String(body.content || '')

  if (!content) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  if (!TEMPLATE_KEYS.includes(templateKey as TemplateKey)) {
    return NextResponse.json({ error: 'Invalid template_key' }, { status: 400 })
  }

  const meta = TEMPLATE_METADATA[templateKey as TemplateKey]

  const { error } = await admin
    .from('sms_templates')
    .upsert(
      {
        organization_id: organizationId,
        template_key: templateKey,
        content,
        name: meta?.name || templateKey,
        description: meta?.description || null,
        last_modified_by: userId,
        last_modified_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,template_key' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, ctx: { params: { templateKey: string } }) {
  const { templateKey } = ctx.params
  const ctxOrg = await requireOrg()
  if ('error' in ctxOrg) return ctxOrg.error

  const { admin, organizationId } = ctxOrg

  const { error } = await admin
    .from('sms_templates')
    .delete()
    .eq('organization_id', organizationId)
    .eq('template_key', templateKey)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
