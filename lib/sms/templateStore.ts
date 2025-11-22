'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { TemplateKey, TEMPLATE_METADATA } from './templateMetadata'

type TemplateRow = {
  template_key: string
  content: string
}

const templateCache = new Map<string, string>()

const cacheKey = (organizationId: string | null, key: TemplateKey) =>
  `${organizationId || 'global'}::${key}`

async function fetchTemplateFromDatabase(organizationId: string | null, key: TemplateKey) {
  const admin = createAdminClient()

  if (!organizationId) {
    return null
  }

  const { data, error } = await admin
    .from('sms_templates')
    .select('template_key, content')
    .eq('organization_id', organizationId)
    .eq('template_key', key)
    .maybeSingle<TemplateRow>()

  if (error) {
    console.error('[sms_templates] Failed to load template', error)
    return null
  }

  return data?.content || null
}

export async function getTemplateContent(
  organizationId: string | null,
  key: TemplateKey,
  forceRefresh = false
): Promise<string> {
  const cacheId = cacheKey(organizationId, key)
  if (!forceRefresh && templateCache.has(cacheId)) {
    return templateCache.get(cacheId)!
  }

  const dbContent = await fetchTemplateFromDatabase(organizationId, key)
  const content = dbContent || TEMPLATE_METADATA[key].defaultContent
  templateCache.set(cacheId, content)
  return content
}

export async function clearTemplateCacheForOrg(organizationId: string) {
  for (const key of templateCache.keys()) {
    if (key.startsWith(`${organizationId}::`)) {
      templateCache.delete(key)
    }
  }
}
