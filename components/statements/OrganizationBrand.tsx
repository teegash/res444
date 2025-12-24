'use client'

import { useMemo } from 'react'

type Props = {
  name?: string | null
  logoUrl?: string | null
  subtitle?: string
}

function initialsFromName(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return 'RE'
  const parts = trimmed.split(/\s+/).filter(Boolean)
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
  return initials || trimmed.slice(0, 2).toUpperCase()
}

export function OrganizationBrand({ name, logoUrl, subtitle = 'Property Management' }: Props) {
  const displayName = (name || 'RES').trim() || 'RES'
  const initials = useMemo(() => initialsFromName(displayName), [displayName])

  return (
    <div className="flex items-center gap-3">
      <div className="h-12 w-12 rounded-xl overflow-hidden border bg-white shadow-sm ring-1 ring-black/5">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={`${displayName} logo`}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="h-full w-full grid place-items-center bg-gradient-to-br from-slate-900 to-slate-700 text-white font-semibold">
            {initials}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <h2 className="text-xl md:text-2xl font-bold text-slate-900 truncate">{displayName}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  )
}

