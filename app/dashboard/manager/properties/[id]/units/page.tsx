'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Building2, Search, Eye, Pencil, UserPlus, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

const unitsData = [
  { id: '101', number: 'A-101', bedrooms: 2, size: 900, rent: 45000, tenant: 'John Kamau', leaseEnd: 'Dec 31, 2025', status: 'Occupied' },
  { id: '102', number: 'A-102', bedrooms: 2, size: 900, rent: 45000, tenant: 'Mary Wanjiku', leaseEnd: 'Jan 15, 2025', status: 'Occupied' },
  { id: '103', number: 'A-103', bedrooms: 2, size: 900, rent: 45000, tenant: null, leaseEnd: null, status: 'Vacant' },
  { id: '104', number: 'A-104', bedrooms: 2, size: 900, rent: 45000, tenant: 'David Kiprop', leaseEnd: 'Mar 20, 2025', status: 'Occupied' },
  { id: '201', number: 'B-201', bedrooms: 3, size: 1200, rent: 60000, tenant: 'Peter Ochieng', leaseEnd: 'Feb 28, 2025', status: 'Occupied' },
  { id: '202', number: 'B-202', bedrooms: 3, size: 1200, rent: 60000, tenant: 'Grace Akinyi', leaseEnd: 'Apr 10, 2025', status: 'Occupied' },
  { id: '203', number: 'B-203', bedrooms: 3, size: 1200, rent: 60000, tenant: null, leaseEnd: null, status: 'Vacant' },
  { id: '204', number: 'B-204', bedrooms: 3, size: 1200, rent: 60000, tenant: 'Sarah Muthoni', leaseEnd: 'May 15, 2025', status: 'Occupied' },
  { id: '301', number: 'C-301', bedrooms: 1, size: 600, rent: 35000, tenant: 'James Ochieng', leaseEnd: 'Jun 30, 2025', status: 'Occupied' },
  { id: '302', number: 'C-302', bedrooms: 1, size: 600, rent: 35000, tenant: null, leaseEnd: null, status: 'Maintenance' },
]

export default function PropertyUnitsPage() {
  const router = useRouter()
  const params = useParams()
  const [searchQuery, setSearchQuery] = useState('')

  const totalUnits = unitsData.length
  const occupiedUnits = unitsData.filter(u => u.status === 'Occupied').length
  const vacantUnits = unitsData.filter(u => u.status === 'Vacant').length
  const maintenanceUnits = unitsData.filter(u => u.status === 'Maintenance').length

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/dashboard/manager/properties/${params.id}`)}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Building2 className="w-7 h-7 text-blue-600" />
            <div>
              <div className="text-sm text-gray-500">Kilimani Heights - Units</div>
            </div>
          </div>
        </div>
        <Link href={`/dashboard/manager/properties/${params.id}/units/new`}>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Building2 className="w-4 h-4 mr-2" />
            Add Unit
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Total Units</div>
          <div className="text-3xl font-bold text-gray-900">{totalUnits}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Occupied</div>
          <div className="text-3xl font-bold text-blue-600">{occupiedUnits}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Vacant</div>
          <div className="text-3xl font-bold text-orange-600">{vacantUnits}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Maintenance</div>
          <div className="text-3xl font-bold text-red-600">{maintenanceUnits}</div>
        </Card>
      </div>

      {/* Filter Units */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Filter Units</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search units..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="Unit Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="1bed">1 Bedroom</SelectItem>
              <SelectItem value="2bed">2 Bedroom</SelectItem>
              <SelectItem value="3bed">3 Bedroom</SelectItem>
            </SelectContent>
          </Select>
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="occupied">Occupied</SelectItem>
              <SelectItem value="vacant">Vacant</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
            </SelectContent>
          </Select>
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="Floor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Floors</SelectItem>
              <SelectItem value="a">Floor A</SelectItem>
              <SelectItem value="b">Floor B</SelectItem>
              <SelectItem value="c">Floor C</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Units List */}
      <div className="space-y-3">
        {unitsData.map((unit) => (
          <Card key={unit.id} className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className="flex-1 grid grid-cols-5 gap-4 items-center">
                <div>
                  <div className="font-bold text-gray-900">{unit.number}</div>
                  <div className="text-sm text-gray-500">{unit.bedrooms} Bedroom • {unit.size} sq ft</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Monthly Rent</div>
                  <div className="font-medium text-gray-900">KES {unit.rent.toLocaleString()}/month</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">{unit.tenant ? 'Tenant' : 'Status'}</div>
                  <div className="font-medium text-gray-900">{unit.tenant || 'Available'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">{unit.leaseEnd ? 'Lease ends' : ''}</div>
                  <div className="text-sm text-gray-600">{unit.leaseEnd || ''}</div>
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    unit.status === 'Occupied' ? 'bg-gray-900 text-white' :
                    unit.status === 'Vacant' ? 'bg-gray-200 text-gray-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {unit.status}
                  </span>
                  <Button variant="outline" size="icon">
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="icon">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  {unit.status === 'Vacant' && (
                    <Button 
                      className="bg-gray-900 hover:bg-gray-800"
                      size="sm"
                      onClick={() => router.push(`/dashboard/manager/properties/${params.id}/units/${unit.number}/add-tenant`)}
                    >
                      <UserPlus className="w-4 h-4 mr-1" />
                      Add Tenant
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
