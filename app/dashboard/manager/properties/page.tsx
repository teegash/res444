'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Building2, Eye, Pencil, MapPin, Users } from 'lucide-react'
import Link from 'next/link'

// Sample data matching reference
const propertiesData = [
  {
    id: 1,
    name: 'Kilimani Heights',
    location: 'Kilimani, Nairobi',
    type: 'Apartment Complex',
    units: { occupied: 22, total: 24 },
    revenue: 1080000,
    status: 'Active',
    occupancy: 92
  },
  {
    id: 2,
    name: 'Westlands Plaza',
    location: 'Westlands, Nairobi',
    type: 'Commercial',
    units: { occupied: 16, total: 18 },
    revenue: 864000,
    status: 'Active',
    occupancy: 89
  },
  {
    id: 3,
    name: 'Karen Villas',
    location: 'Karen, Nairobi',
    type: 'Townhouse',
    units: { occupied: 7, total: 8 },
    revenue: 420000,
    status: 'Active',
    occupancy: 88
  },
  {
    id: 4,
    name: 'Eastlands Court',
    location: 'Eastlands, Nairobi',
    type: 'Apartment Complex',
    units: { occupied: 28, total: 32 },
    revenue: 672000,
    status: 'Active',
    occupancy: 88
  }
]

export default function ManagerPropertiesPage() {
  const router = useRouter()
  const totalUnits = propertiesData.reduce((sum, p) => sum + p.units.total, 0)
  const occupiedUnits = propertiesData.reduce((sum, p) => sum + p.units.occupied, 0)
  const occupancyRate = Math.round((occupiedUnits / totalUnits) * 100)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">Properties</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/manager">
            <Button variant="outline" size="sm">
              Back to Dashboard
            </Button>
          </Link>
          <Link href="/dashboard/manager/properties/new">
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Building2 className="w-4 h-4 mr-2" />
              Add Property
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="text-sm font-medium text-gray-600 mb-1">Total Properties</div>
          <div className="text-3xl font-bold text-gray-900">{propertiesData.length}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-medium text-gray-600 mb-1">Total Units</div>
          <div className="text-3xl font-bold text-gray-900">{totalUnits}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-medium text-gray-600 mb-1">Occupied Units</div>
          <div className="text-3xl font-bold text-gray-900">{occupiedUnits}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-medium text-gray-600 mb-1">Occupancy Rate</div>
          <div className="text-3xl font-bold text-gray-900">{occupancyRate}%</div>
        </Card>
      </div>

      {/* Properties List */}
      <div className="space-y-4">
        {propertiesData.map((property) => (
          <Card key={property.id} className="p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <Building2 className="w-6 h-6 text-blue-600" />
                  <h3 className="text-xl font-bold text-gray-900">{property.name}</h3>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                  <MapPin className="w-4 h-4" />
                  {property.location}
                </div>

                <div className="grid grid-cols-3 gap-6">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Type</div>
                    <div className="font-medium text-gray-900">{property.type}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Units</div>
                    <div className="font-medium text-gray-900 flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {property.units.occupied}/{property.units.total}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Monthly Revenue</div>
                    <div className="font-medium text-green-600">
                      KES {property.revenue.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                    <span>Occupancy</span>
                    <span>{property.occupancy}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${property.occupancy}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 ml-6">
                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                  {property.status}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => router.push(`/dashboard/manager/properties/${property.id}`)}
                >
                  <Eye className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => router.push(`/dashboard/manager/properties/${property.id}/edit`)}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
