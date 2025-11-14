'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Phone, Mail } from 'lucide-react'

const tenants = [
  { id: 1, name: 'John Doe', unit: '12B', property: 'Westlands Plaza', status: 'Active', phone: '+254712345678', email: 'john@example.com' },
  { id: 2, name: 'Jane Smith', unit: '5A', property: 'Kilimani Towers', status: 'Active', phone: '+254712345679', email: 'jane@example.com' },
  { id: 3, name: 'Mike Johnson', unit: '8C', property: 'Langata Heights', status: 'Active', phone: '+254712345680', email: 'mike@example.com' },
]

export function ManagerTenantsList() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Tenants</CardTitle>
        <CardDescription>Manage your assigned tenants</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {tenants.map((tenant) => (
            <div key={tenant.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex-1">
                <h3 className="font-semibold">{tenant.name}</h3>
                <p className="text-sm text-muted-foreground">{tenant.unit}, {tenant.property}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Phone className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Mail className="h-4 w-4" />
                </Button>
                <Badge>{tenant.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
