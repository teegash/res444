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

export async function GET() {
  const ctx = await requireOrg()
  if ('error' in ctx) return ctx.error

  const { admin, organizationId } = ctx
  const { data, error } = await admin
    .from('sms_templates')
    .select('template_key, content, name, description')
    .eq('organization_id', organizationId)
    .order('template_key', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const rows = Array.isArray(data) ? data : []
  const rowMap = new Map(rows.map((row) => [row.template_key, row]))
  const extraKeys = rows
    .map((row) => row.template_key)
    .filter((key): key is string => Boolean(key))
    .filter((key) => !TEMPLATE_KEYS.includes(key as TemplateKey))
    .sort()

  const formatLabel = (key: string) =>
    key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())

  const templates = [...TEMPLATE_KEYS, ...extraKeys].map((key) => {
    const fallbackMeta = key.startsWith('rent_stage_') ? TEMPLATE_METADATA.rent_stage_5 : undefined
    const meta = TEMPLATE_METADATA[key as TemplateKey] || fallbackMeta
    const row = rowMap.get(key)
    return {
      key,
      template_key: key,
      name: row?.name || meta?.name || formatLabel(key),
      description: row?.description || meta?.description || '',
      content: row?.content || meta?.defaultContent || '',
      placeholders: meta?.placeholders || [],
    }
  })

  return NextResponse.json({ templates })
}

export async function POST(req: NextRequest) {
  const ctx = await requireOrg()
  if ('error' in ctx) return ctx.error
  const { admin, organizationId, userId } = ctx

  const body = await req.json().catch(() => ({}))
  const templateKey = String(body.template_key || '')
  const content = String(body.content || '')

  if (!templateKey || !content) {
    return NextResponse.json({ error: 'template_key and content are required' }, { status: 400 })
  }

  const isKnown = TEMPLATE_KEYS.includes(templateKey as TemplateKey)
  if (!isKnown) {
    const { data: existing } = await admin
      .from('sms_templates')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('template_key', templateKey)
      .maybeSingle()
    if (!existing?.id) {
      return NextResponse.json({ error: 'Invalid template_key' }, { status: 400 })
    }
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
