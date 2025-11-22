import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TEMPLATE_KEYS, TEMPLATE_METADATA, TemplateKey } from '@/lib/sms/templateMetadata'
import { clearTemplateCacheForOrg } from '@/lib/sms/templateStore'

async function getUserAndOrg() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }
  }

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership?.organization_id) {
    return {
      error: NextResponse.json(
        { success: false, error: 'You are not assigned to an organization.' },
        { status: 403 }
      ),
    }
  }

  return { user, organizationId: membership.organization_id, admin }
}

export async function GET() {
  const ctx = await getUserAndOrg()
  if ('error' in ctx) {
    return ctx.error
  }

  const { organizationId, admin } = ctx

  const { data, error } = await admin
    .from('sms_templates')
    .select('template_key, content, description, name')
    .eq('organization_id', organizationId)

  if (error) {
    console.error('[sms_templates] GET failed', error)
    return NextResponse.json({ success: false, error: 'Failed to load templates.' }, { status: 500 })
  }

  const customMap = new Map<string, { content: string; description?: string; name?: string }>()
  data?.forEach((row) =>
    customMap.set(row.template_key, {
      content: row.content,
      description: row.description || undefined,
      name: row.name || undefined,
    })
  )

  const payload = TEMPLATE_KEYS.map((key) => {
    const metadata = TEMPLATE_METADATA[key]
    const custom = customMap.get(key)
    return {
      key,
      name: custom?.name || metadata.name,
      description: custom?.description || metadata.description,
      placeholders: metadata.placeholders,
      content: custom?.content || metadata.defaultContent,
    }
  })

  return NextResponse.json({ success: true, data: payload })
}

export async function PUT(request: NextRequest) {
  const ctx = await getUserAndOrg()
  if ('error' in ctx) {
    return ctx.error
  }

  const { user, organizationId, admin } = ctx

  const body = await request.json().catch(() => ({}))
  const templates: Array<{
    key: TemplateKey
    content: string
    name?: string
    description?: string
  }> = body?.templates

  if (!Array.isArray(templates) || templates.length === 0) {
    return NextResponse.json(
      { success: false, error: 'No template updates were provided.' },
      { status: 400 }
    )
  }

  const validTemplates = templates.filter((tpl) => TEMPLATE_KEYS.includes(tpl.key))
  if (validTemplates.length === 0) {
    return NextResponse.json(
      { success: false, error: 'No valid template keys provided.' },
      { status: 400 }
    )
  }

  const upsertPayload = validTemplates.map((tpl) => ({
    organization_id: organizationId,
    template_key: tpl.key,
    content: tpl.content,
    name: tpl.name || TEMPLATE_METADATA[tpl.key].name,
    description: tpl.description || TEMPLATE_METADATA[tpl.key].description,
    last_modified_by: user.id,
    last_modified_at: new Date().toISOString(),
  }))

  const { error } = await admin.from('sms_templates').upsert(upsertPayload, {
    onConflict: 'organization_id,template_key',
  })

  if (error) {
    console.error('[sms_templates] PUT failed', error)
    return NextResponse.json({ success: false, error: 'Failed to save templates.' }, { status: 500 })
  }

  clearTemplateCacheForOrg(organizationId)

  return NextResponse.json({ success: true })
}
