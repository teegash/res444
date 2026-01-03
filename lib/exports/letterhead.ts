'use client'

export type LetterheadMeta = {
  organizationName: string
  organizationLocation?: string
  organizationPhone?: string
  organizationLogoUrl?: string | null

  tenantName?: string
  tenantPhone?: string
  propertyName?: string
  unitNumber?: string

  reportingPeriod?: string
  referenceNumber?: string
  preparedBy?: string

  documentTitle: string
  generatedAtISO: string
}

export type ResolvedOrganizationBrand = {
  name: string
  location?: string | null
  phone?: string | null
  logo_url?: string | null
}

export async function fetchCurrentOrganizationBrand(): Promise<ResolvedOrganizationBrand | null> {
  try {
    const response = await fetch('/api/organizations/current', {
      cache: 'no-store',
      credentials: 'include',
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.success || !payload?.data?.name) return null
    return {
      name: String(payload.data.name),
      location: payload.data.location ?? payload.data.organization_location ?? null,
      phone: payload.data.phone_number ?? payload.data.phone ?? payload.data.organization_phone ?? null,
      logo_url: payload.data.logo_url ?? payload.data.logo ?? null,
    }
  } catch {
    return null
  }
}

export function safeFilename(value: string) {
  return (
    value
      .trim()
      .replace(/[^\w\-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120) || 'export'
  )
}

export function formatGeneratedAt(iso: string) {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return new Date().toLocaleString()
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function buildLetterheadLines(meta: LetterheadMeta) {
  const left: string[] = []
  const right: string[] = []

  if (meta.organizationLocation) left.push(String(meta.organizationLocation))
  if (meta.organizationPhone) left.push(String(meta.organizationPhone))

  if (meta.referenceNumber) left.push(`Ref: ${meta.referenceNumber}`)
  if (meta.reportingPeriod) left.push(`Period: ${meta.reportingPeriod}`)
  if (meta.preparedBy) left.push(`Prepared by: ${meta.preparedBy}`)

  if (meta.tenantName) right.push(`Tenant: ${meta.tenantName}`)
  if (meta.tenantPhone) right.push(`Phone: ${meta.tenantPhone}`)
  if (meta.propertyName) right.push(`Property: ${meta.propertyName}`)
  if (meta.unitNumber) right.push(`Unit: ${meta.unitNumber}`)

  return { left, right }
}
