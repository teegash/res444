'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BulkUnitCreation } from '@/components/dashboard/bulk-unit-creation'

interface ManageUnitsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  property: any
}

const mockUnits = [
  { id: 1, number: '101', bedrooms: 2, bathrooms: 1, sqft: 900, price: 10000, status: 'Occupied', tenant: 'John Doe' },
  { id: 2, number: '102', bedrooms: 2, bathrooms: 1, sqft: 900, price: 10000, status: 'Vacant', tenant: '-' },
  { id: 3, number: '103', bedrooms: 3, bathrooms: 2, sqft: 1200, price: 15000, status: 'Occupied', tenant: 'Jane Smith' },
]

export function ManageUnitsModal({ open, onOpenChange, property }: ManageUnitsModalProps) {
  const [activeTab, setActiveTab] = useState('view')

  if (!property) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Units - {property.name}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="view">View Units</TabsTrigger>
            <TabsTrigger value="add">Add Units</TabsTrigger>
          </TabsList>

          <TabsContent value="view" className="space-y-4">
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unit Number</TableHead>
                    <TableHead>BR/BA</TableHead>
                    <TableHead>Sqft</TableHead>
                    <TableHead>Price (KES)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockUnits.map((unit) => (
                    <TableRow key={unit.id}>
                      <TableCell className="font-medium">{unit.number}</TableCell>
                      <TableCell>{unit.bedrooms}BR/{unit.bathrooms}BA</TableCell>
                      <TableCell>{unit.sqft}</TableCell>
                      <TableCell>{unit.price.toLocaleString()}</TableCell>
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
          </TabsContent>

          <TabsContent value="add" className="space-y-4">
            <BulkUnitCreation />
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
