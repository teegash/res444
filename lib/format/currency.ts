export function formatCurrency(
  amount: number | string | null | undefined,
  currency: string = 'KES',
  locale: string = 'en-KE'
): string {
  const value = typeof amount === 'string' ? Number(amount) : amount ?? 0
  if (!Number.isFinite(value)) return `${currency} 0`

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatCompactNumber(value: number): string {
  const numeric = Number(value || 0)
  const abs = Math.abs(numeric)
  const sign = numeric < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`
  return `${sign}${Math.round(abs)}`
}
