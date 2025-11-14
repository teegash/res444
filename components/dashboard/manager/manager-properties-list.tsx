'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const properties = [
  { id: 1, name: 'Westlands Plaza', units: 12, occupied: 11, address: 'Nairobi' },
  { id: 2, name: 'Kilimani Towers', units: 15, occupied: 13, address: 'Nairobi' },
  { id: 3, name: 'Langata Heights', units: 8, occupied: 7, address: 'Nairobi' },
  { id: 4, name: 'Upper Hill Apartments', units: 4, occupied: 4, address: 'Nairobi' },
  { id: 5, name: 'Spring Valley Homes', units: 3, occupied: 3, address: 'Nairobi' },
]

export function ManagerPropertiesList() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Properties</CardTitle>
        <CardDescription>Manage your assigned properties</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {properties.map((property) => (
            <div key={property.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex-1">
                <h3 className="font-semibold">{property.name}</h3>
                <p className="text-sm text-muted-foreground">{property.address}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm font-medium">{property.occupied}/{property.units} Units</div>
                  <Badge variant="outline">
                    {Math.round((property.occupied / property.units) * 100)}% Occupied
                  </Badge>
                </div>
                <Button variant="ghost" size="sm">View</Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
