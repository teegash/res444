'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Phone, MessageSquare } from 'lucide-react'

const tenants = [
  { id: 1, name: 'John Doe', unit: '12B', phone: '+254712345678', moveInDate: '2023-06-15' },
  { id: 2, name: 'Jane Smith', unit: '5A', phone: '+254712345679', moveInDate: '2023-08-20' },
  { id: 3, name: 'Mike Johnson', unit: '8C', phone: '+254712345680', moveInDate: '2023-10-10' },
  { id: 4, name: 'Sarah Lee', unit: '3D', phone: '+254712345681', moveInDate: '2024-01-05' },
]

export function TenantDirectory() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tenant Directory</CardTitle>
        <CardDescription>Contact your building tenants</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-2">Name</th>
                <th className="text-left py-3 px-2">Unit</th>
                <th className="text-left py-3 px-2">Phone</th>
                <th className="text-left py-3 px-2">Move-in Date</th>
                <th className="text-left py-3 px-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="border-b hover:bg-muted/50">
                  <td className="py-3 px-2">{tenant.name}</td>
                  <td className="py-3 px-2 font-semibold">{tenant.unit}</td>
                  <td className="py-3 px-2 font-mono text-xs">{tenant.phone}</td>
                  <td className="py-3 px-2 text-xs">{tenant.moveInDate}</td>
                  <td className="py-3 px-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
