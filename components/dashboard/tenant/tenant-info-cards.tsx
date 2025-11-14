'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Home, DollarSign, Calendar } from 'lucide-react'

export function TenantInfoCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Property Card */}
      <Card className="bg-white border shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center shrink-0">
              <Home className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium">Property</p>
              <p className="text-xl font-bold text-foreground">Kilimani Heights</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Rent Card */}
      <Card className="bg-white border shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
              <DollarSign className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium">Monthly Rent</p>
              <p className="text-xl font-bold text-primary">KES 45,000</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lease Expires Card */}
      <Card className="bg-white border shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center shrink-0">
              <Calendar className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium">Lease Expires</p>
              <p className="text-xl font-bold text-foreground">Dec 31, 2025</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
