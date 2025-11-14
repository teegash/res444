'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Droplets, Plus } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'

const recentWaterBills = [
  { id: 1, unit: 'A-101', month: 'January 2024', units: 45, unitCost: 50, amount: 2250, dateAdded: '2024-01-05' },
  { id: 2, unit: 'A-102', month: 'January 2024', units: 42, unitCost: 50, amount: 2100, dateAdded: '2024-01-05' },
  { id: 3, unit: 'A-103', month: 'December 2023', units: 40, unitCost: 50, amount: 2000, dateAdded: '2023-12-02' },
]

export function WaterBillManagement() {
  const [isAddingBill, setIsAddingBill] = useState(false)
  const [selectedUnit, setSelectedUnit] = useState('')
  const [waterUnits, setWaterUnits] = useState('')
  const [unitCost, setUnitCost] = useState('50')

  const totalAmount = waterUnits && unitCost ? (parseFloat(waterUnits) * parseFloat(unitCost)).toFixed(2) : '0'

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-r from-blue-500/5 to-cyan-500/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplets className="h-5 w-5 text-blue-500" />
              <div>
                <CardTitle>Water Bill Management</CardTitle>
                <CardDescription>Add and track monthly water bills per unit</CardDescription>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setIsAddingBill(!isAddingBill)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Water Bill
            </Button>
          </div>
        </CardHeader>
        {isAddingBill && (
          <CardContent className="pt-4 border-t space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit">Select Unit</Label>
                <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                  <SelectTrigger id="unit">
                    <SelectValue placeholder="Choose unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A-101">Unit A-101</SelectItem>
                    <SelectItem value="A-102">Unit A-102</SelectItem>
                    <SelectItem value="A-103">Unit A-103</SelectItem>
                    <SelectItem value="B-201">Unit B-201</SelectItem>
                    <SelectItem value="B-202">Unit B-202</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="month">Month</Label>
                <Input id="month" type="month" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="units">Water Units</Label>
                <Input 
                  id="units" 
                  type="number" 
                  placeholder="45" 
                  value={waterUnits}
                  onChange={(e) => setWaterUnits(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost">Cost per Unit (KES)</Label>
                <Input 
                  id="cost" 
                  type="number" 
                  placeholder="50" 
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
              <span className="text-sm font-medium">Total Amount:</span>
              <span className="text-lg font-bold text-blue-600">KES {totalAmount}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setIsAddingBill(false)}>
                Cancel
              </Button>
              <Button className="flex-1">Add to Unit Invoice</Button>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Water Bills</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentWaterBills.map((bill) => (
              <div key={bill.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline">{bill.unit}</Badge>
                    <p className="font-semibold text-sm">{bill.month}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {bill.units} units × KES {bill.unitCost} = KES {bill.amount.toLocaleString()}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">{bill.dateAdded}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
