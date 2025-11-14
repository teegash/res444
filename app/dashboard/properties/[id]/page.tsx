'use client'

import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ArrowLeft, Phone, Mail, MapPin, Users, DollarSign, Home } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default function PropertyDetailPage() {
  const router = useRouter()
  const params = useParams()
  const propertyId = params?.id

  const property = {
    id: propertyId,
    name: 'Alpha Complex',
    location: 'Nairobi, Kenya',
    description: 'A modern residential complex with 15 units',
    county: 'Nairobi',
    manager: 'John Manager',
    managerPhone: '+254712345678',
    managerEmail: 'john@example.com',
    totalUnits: 15,
    occupiedUnits: 12,
    vacantUnits: 3,
    totalRevenue: 120000,
    image: '/modern-residential-building.png',
  }

  const units = [
    { id: 1, number: '101', bedrooms: 2, bathrooms: 1, sqft: 900, price: 10000, status: 'Occupied', tenant: 'John Doe' },
    { id: 2, number: '102', bedrooms: 2, bathrooms: 1, sqft: 900, price: 10000, status: 'Vacant', tenant: '-' },
    { id: 3, number: '103', bedrooms: 3, bathrooms: 2, sqft: 1200, price: 15000, status: 'Occupied', tenant: 'Jane Smith' },
    { id: 4, number: '201', bedrooms: 2, bathrooms: 1, sqft: 900, price: 10000, status: 'Occupied', tenant: 'Mike Johnson' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-3xl font-bold">{property.name}</h1>
      </div>

      {/* Hero Section */}
      <div
        className="h-64 rounded-lg bg-muted"
        style={{
          backgroundImage: `url('${property.image}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      {/* Property Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Overview Card */}
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4" />
              <span>{property.location}</span>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Status</p>
              <Badge className="bg-green-600">Active</Badge>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">County</p>
              <p className="text-sm">{property.county}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{property.description}</p>
            </div>
          </CardContent>
        </Card>

        {/* Occupancy Card */}
        <Card>
          <CardHeader>
            <CardTitle>Occupancy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-end">
              <div>
                <p className="text-2xl font-bold">{property.occupiedUnits}</p>
                <p className="text-xs text-muted-foreground">Occupied Units</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-orange-500">{property.vacantUnits}</p>
                <p className="text-xs text-muted-foreground">Vacant</p>
              </div>
            </div>
            <Progress value={(property.occupiedUnits / property.totalUnits) * 100} />
            <p className="text-sm font-medium">
              {Math.round((property.occupiedUnits / property.totalUnits) * 100)}% Occupancy Rate
            </p>
          </CardContent>
        </Card>

        {/* Revenue Card */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm text-muted-foreground">Monthly</p>
                <p className="text-2xl font-bold">KES {property.totalRevenue.toLocaleString()}</p>
              </div>
            </div>
            <Button className="w-full gap-2">
              <Home className="w-4 h-4" />
              View Financial Reports
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Manager Information */}
      <Card>
        <CardHeader>
          <CardTitle>Property Manager</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Manager Name</p>
              <p className="font-medium">{property.manager}</p>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium">{property.managerPhone}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium text-sm">{property.managerEmail}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Units Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Units</CardTitle>
          <Badge variant="outline">{property.totalUnits} Total</Badge>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit Number</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Sqft</TableHead>
                  <TableHead>Monthly Rent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((unit) => (
                  <TableRow key={unit.id}>
                    <TableCell className="font-medium">{unit.number}</TableCell>
                    <TableCell>{unit.bedrooms}BR/{unit.bathrooms}BA</TableCell>
                    <TableCell>{unit.sqft}</TableCell>
                    <TableCell>KES {unit.price.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={unit.status === 'Occupied' ? 'default' : 'secondary'}>
                        {unit.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{unit.tenant}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">
                        {unit.status === 'Vacant' ? 'Add Tenant' : 'View'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
