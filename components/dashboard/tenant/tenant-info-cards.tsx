'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Home, DollarSign, Calendar } from 'lucide-react'

interface TenantInfoCardsProps {
  summary?: {
    lease: {
      property_name: string | null
      property_location: string | null
      unit_label: string | null
      monthly_rent: number | null
      end_date: string | null
    } | null
  } | null
  loading?: boolean
}

const currencyFormatter = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  minimumFractionDigits: 0,
})

const formatCurrency = (value: number | null | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'Pending'
  }
  return currencyFormatter.format(value)
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'Not set'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not set'
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function TenantInfoCards({ summary, loading }: TenantInfoCardsProps) {
  const propertyName = summary?.lease?.property_name || 'Your Property'
  const propertyLocation = summary?.lease?.property_location || 'Awaiting assignment'
  const monthlyRent = formatCurrency(summary?.lease?.monthly_rent)
  const leaseEnd = formatDate(summary?.lease?.end_date)
  const unitLabel = summary?.lease?.unit_label

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="bg-white border shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center shrink-0">
              <Home className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium">Property</p>
              <p className="text-xl font-bold text-foreground">
                {loading ? 'Loading…' : propertyName}
              </p>
              <p className="text-xs text-muted-foreground">
                {loading ? '' : unitLabel || propertyLocation}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
              <DollarSign className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium">Monthly Rent</p>
              <p className="text-xl font-bold text-primary">
                {loading ? 'Loading…' : monthlyRent}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center shrink-0">
              <Calendar className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium">Lease Expires</p>
              <p className="text-xl font-bold text-foreground">
                {loading ? 'Loading…' : leaseEnd}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
