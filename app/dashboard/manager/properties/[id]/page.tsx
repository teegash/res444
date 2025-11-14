import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { ArrowLeft, Edit, Settings, Building2, MapPin, DollarSign, Users, Home, Clock } from 'lucide-react'

export default function PropertyDetailsPage({ params }: { params: { id: string } }) {
  // Mock property data - would come from API
  const property = {
    id: params.id,
    name: 'Kilimani Heights',
    type: 'Apartment Complex',
    location: 'Kilimani, Nairobi',
    address: '123 Kilimani Road, Nairobi',
    totalUnits: 24,
    occupiedUnits: 22,
    occupancyRate: '92%',
    monthlyRevenue: 'KES 1,080,000',
    status: 'Active',
    manager: {
      name: 'Jane Wanjiku',
      phone: '254712345678',
      email: 'jane@kilimaniheights.com'
    },
    description: 'Modern apartment complex with excellent amenities and prime location in Kilimani.',
    amenities: ['Parking', 'Security Guard', 'CCTV', 'Swimming Pool', 'Gym', 'Elevator', 'Generator']
  }

  const units = [
    { id: 'A-101', bedrooms: 2, size: '900 sq ft', rent: 45000, tenant: 'John Kamau', status: 'Occupied', lease: 'Dec 31, 2025' },
    { id: 'A-102', bedrooms: 2, size: '900 sq ft', rent: 45000, tenant: 'Mary Wanjiku', status: 'Occupied', lease: 'Jan 15, 2025' },
    { id: 'A-103', bedrooms: 2, size: '900 sq ft', rent: 45000, tenant: null, status: 'Vacant', lease: null },
    { id: 'B-201', bedrooms: 3, size: '1200 sq ft', rent: 60000, tenant: 'Peter Ochieng', status: 'Occupied', lease: 'Feb 28, 2025' },
    { id: 'B-202', bedrooms: 3, size: '1200 sq ft', rent: 60000, tenant: 'Grace Akinyi', status: 'Occupied', lease: 'Apr 10, 2025' },
    { id: 'B-203', bedrooms: 3, size: '1200 sq ft', rent: 60000, tenant: null, status: 'Vacant', lease: null },
  ]

  const recentActivity = [
    { text: 'Rent payment received from John Kamau (A-101)', date: 'Dec 3, 2024' },
    { text: 'Maintenance request submitted for A-102', date: 'Dec 2, 2024' },
    { text: 'New tenant moved into B-201', date: 'Dec 1, 2024' },
    { text: 'Unit B-203 became vacant', date: 'Nov 30, 2024' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/manager">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Properties
              </Button>
            </Link>
            <Building2 className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold">{property.name}</h1>
          </div>
          <div className="flex gap-2">
            <Link href={`/dashboard/manager/properties/${params.id}/edit`}>
              <Button variant="outline">
                <Edit className="h-4 w-4 mr-2" />
                Edit Property
              </Button>
            </Link>
            <Link href={`/dashboard/manager/properties/${params.id}/settings`}>
              <Button variant="outline">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <div className="text-sm text-muted-foreground">Total Units</div>
              <div className="text-3xl font-bold">{property.totalUnits}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="text-sm text-muted-foreground">Occupied Units</div>
              <div className="text-3xl font-bold text-blue-600">{property.occupiedUnits}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="text-sm text-muted-foreground">Occupancy Rate</div>
              <div className="text-3xl font-bold text-green-600">{property.occupancyRate}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="text-sm text-muted-foreground">Monthly Revenue</div>
              <div className="text-2xl font-bold text-orange-600">{property.monthlyRevenue}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Property Information */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Property Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Property Type</div>
                  <div className="font-medium">{property.type}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Status</div>
                  <Badge className="bg-green-600">{property.status}</Badge>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Location</div>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{property.location}</span>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Address</div>
                  <div className="font-medium">{property.address}</div>
                </div>
              </div>
              
              <div>
                <div className="text-sm text-muted-foreground mb-1">Description</div>
                <p className="text-sm">{property.description}</p>
              </div>
              
              <div>
                <div className="text-sm text-muted-foreground mb-2">Features & Amenities</div>
                <div className="flex flex-wrap gap-2">
                  {property.amenities.map((amenity) => (
                    <Badge key={amenity} variant="outline">{amenity}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Property Manager & Quick Actions */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Property Manager</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="font-medium">{property.manager.name}</div>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">📞</span>
                    <span>{property.manager.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">✉️</span>
                    <span>{property.manager.email}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href={`/dashboard/manager/properties/${params.id}/tenants/new`}>
                  <Button variant="outline" className="w-full justify-start">
                    <Users className="h-4 w-4 mr-2" />
                    Add Tenant
                  </Button>
                </Link>
                <Link href={`/dashboard/manager/properties/${params.id}/payments`}>
                  <Button variant="outline" className="w-full justify-start">
                    <DollarSign className="h-4 w-4 mr-2" />
                    View Payments
                  </Button>
                </Link>
                <Link href={`/dashboard/manager/properties/${params.id}/maintenance`}>
                  <Button variant="outline" className="w-full justify-start">
                    <Settings className="h-4 w-4 mr-2" />
                    Maintenance
                  </Button>
                </Link>
                <Link href={`/dashboard/manager/properties/${params.id}/reports`}>
                  <Button variant="outline" className="w-full justify-start">
                    <Home className="h-4 w-4 mr-2" />
                    Reports
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {recentActivity.map((activity, index) => (
                  <div key={index} className="text-sm">
                    <p className="text-foreground">{activity.text}</p>
                    <p className="text-xs text-muted-foreground">{activity.date}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Units Overview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Units Overview</CardTitle>
            <Link href={`/dashboard/manager/properties/${params.id}/units`}>
              <Button>View All Units</Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {units.map((unit) => (
                <div key={unit.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex-1">
                    <div className="font-medium">{unit.id}</div>
                    <div className="text-sm text-muted-foreground">
                      {unit.bedrooms} Bedroom • {unit.size}
                    </div>
                  </div>
                  <div className="flex-1 text-center">
                    <div className="font-medium">KES {unit.rent.toLocaleString()}/month</div>
                    <div className="text-sm text-muted-foreground">Monthly Rent</div>
                  </div>
                  <div className="flex-1 text-center">
                    <div className="font-medium">{unit.tenant || 'No Tenant'}</div>
                    {unit.lease && (
                      <div className="text-sm text-muted-foreground">Lease ends: {unit.lease}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={unit.status === 'Occupied' ? 'bg-green-600' : 'bg-gray-400'}>
                      {unit.status}
                    </Badge>
                    {unit.status === 'Vacant' && (
                      <Link href={`/dashboard/manager/properties/${params.id}/units/${unit.id}/add-tenant`}>
                        <Button size="sm">Add Tenant</Button>
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
