'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Building2, MapPin, Home } from 'lucide-react'

export function BuildingFocusCard() {
  return (
    <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex gap-3">
            <div className="p-3 bg-primary/20 rounded-lg">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                <span>Westlands Plaza</span>
              </CardTitle>
              <CardDescription className="flex items-center gap-1 mt-1">
                <MapPin className="h-4 w-4" />
                Nairobi, Kenya
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">24</div>
            <p className="text-sm text-muted-foreground mt-1">Total Units</p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-500">20</div>
            <p className="text-sm text-muted-foreground mt-1">Occupied</p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-amber-500">4</div>
            <p className="text-sm text-muted-foreground mt-1">Vacant</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
