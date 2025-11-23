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
