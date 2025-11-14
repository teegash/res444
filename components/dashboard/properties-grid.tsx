'use client'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Edit2, Users, Eye } from 'lucide-react'

const properties = [
  {
    id: 1,
    name: 'Alpha Complex',
    location: 'Nairobi',
    occupied: 12,
    total: 15,
    image: '/modern-residential-building.png',
  },
  {
    id: 2,
    name: 'Beta Towers',
    location: 'Westlands',
    occupied: 8,
    total: 10,
    image: '/modern-apartment-complex.png',
  },
  {
    id: 3,
    name: 'Gamma Heights',
    location: 'Karen',
    occupied: 18,
    total: 20,
    image: '/modern-building.png',
  },
]

interface PropertiesGridProps {
  onEdit: (property: any) => void
  onManageUnits: (property: any) => void
  onView: (id: number) => void
}

export function PropertiesGrid({ onEdit, onManageUnits, onView }: PropertiesGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {properties.map((property) => (
        <Card key={property.id} className="overflow-hidden hover:shadow-lg transition-shadow">
          <div
            className="h-40 bg-muted cursor-pointer"
            style={{
              backgroundImage: `url('${property.image}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
            onClick={() => onView(property.id)}
          />
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-lg">{property.name}</h3>
                <p className="text-sm text-muted-foreground">{property.location}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Badge className="bg-green-600">Active</Badge>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="font-medium">Occupancy</span>
                <span>{property.occupied}/{property.total} Units</span>
              </div>
              <Progress value={(property.occupied / property.total) * 100} />
              <p className="text-xs text-muted-foreground mt-1">
                {Math.round((property.occupied / property.total) * 100)}% occupied
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                onClick={() => onEdit(property)}
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                onClick={() => onManageUnits(property)}
              >
                <Users className="w-4 h-4" />
                Units
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-2"
              onClick={() => onView(property.id)}
            >
              <Eye className="w-4 h-4" />
              View Details
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
