'use client'

import { ArrowLeft, Users, Plus, Search, Filter } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

export default function TenantsManagementPage() {
  const tenants = [
    { name: 'John Kamau', unit: 'Unit A-101', property: 'Kilimani Heights', rent: 45000, status: 'Paid', phone: '+254 712 345 678', email: 'john.kamau@email.com', lease: 'Jan 1, 2024 - Dec 31, 2024', initials: 'JK' },
    { name: 'Mary Wanjiku', unit: 'Unit B-205', property: 'Westlands Plaza', rent: 38000, status: 'Pending', phone: '+254 723 456 789', email: 'mary.wanjiku@email.com', lease: 'Mar 15, 2024 - Mar 14, 2025', initials: 'MW' },
    { name: 'Peter Ochieng', unit: 'Unit C-301', property: 'Karen Villas', rent: 52000, status: 'Paid', phone: '+254 734 567 890', email: 'peter.ochieng@email.com', lease: 'Feb 1, 2024 - Jan 31, 2025', initials: 'PO' },
    { name: 'Grace Akinyi', unit: 'Unit A-203', property: 'Kilimani Heights', rent: 41000, status: 'Overdue', phone: '+254 745 678 901', email: 'grace.akinyi@email.com', lease: 'Apr 1, 2024 - Mar 31, 2025', initials: 'GA' },
    { name: 'David Kiprop', unit: 'Unit B-102', property: 'Eastlands Court', rent: 35000, status: 'Paid', phone: '+254 756 789 012', email: 'david.kiprop@email.com', lease: 'May 15, 2024 - May 14, 2025', initials: 'DK' },
    { name: 'Sarah Muthoni', unit: 'Unit C-205', property: 'Karen Villas', rent: 48000, status: 'Paid', phone: '+254 767 890 123', email: 'sarah.muthoni@email.com', lease: 'Jan 15, 2024 - Jan 14, 2025', initials: 'SM' }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/30 via-white to-white">
      <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/manager">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Tenant Management</h1>
                <p className="text-sm text-muted-foreground">Manage your tenants, track payments, and maintain relationships.</p>
              </div>
            </div>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Tenant
          </Button>
        </div>

        {/* Search and Filter */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search tenants by name, unit, or property..." 
                  className="pl-10"
                />
              </div>
              <Button variant="outline">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tenants Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {tenants.map((tenant) => (
            <Card key={tenant.email} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 bg-blue-100">
                      <AvatarFallback className="text-blue-600 font-semibold">
                        {tenant.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-base">{tenant.name}</CardTitle>
                      <CardDescription className="text-xs">
                        {tenant.unit} • {tenant.property}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge 
                    variant={tenant.status === 'Paid' ? 'default' : tenant.status === 'Pending' ? 'secondary' : 'destructive'}
                    className={
                      tenant.status === 'Paid' ? 'bg-green-600' : 
                      tenant.status === 'Pending' ? 'bg-yellow-600' : 
                      'bg-red-600'
                    }
                  >
                    {tenant.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm font-medium mb-1">Monthly Rent</p>
                  <p className="text-2xl font-bold text-green-600">
                    KES {tenant.rent.toLocaleString()}
                  </p>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-xs">📞</span>
                    <span>{tenant.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-xs">📧</span>
                    <span className="truncate">{tenant.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-xs">📅</span>
                    <span className="text-xs">Lease: {tenant.lease}</span>
                  </div>
                </div>
                <div className="flex gap-2 pt-3 border-t">
                  <Button size="sm" variant="outline" className="flex-1">
                    <span className="text-xs">👁️</span>
                    <span className="ml-1">View Details</span>
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1">
                    <span className="text-xs">💬</span>
                    <span className="ml-1">Contact</span>
                  </Button>
                  <Button size="sm" variant="outline">
                    <span className="text-xs">💰</span>
                    <span className="ml-1">Collect Rent</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
