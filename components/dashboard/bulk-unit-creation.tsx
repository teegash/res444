'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Trash2, Plus } from 'lucide-react'

interface UnitType {
  id: string
  number: number
  pattern: string
  price: number
  bedrooms: string
  bathrooms: string
  floor: string
  sqft: number
}

export function BulkUnitCreation() {
  const [units, setUnits] = useState<UnitType[]>([
    {
      id: '1',
      number: 10,
      pattern: '101-110',
      price: 10000,
      bedrooms: '2',
      bathrooms: '1',
      floor: '1st',
      sqft: 900,
    },
    {
      id: '2',
      number: 20,
      pattern: '201-220',
      price: 25000,
      bedrooms: '3',
      bathrooms: '2',
      floor: '2nd',
      sqft: 1400,
    },
  ])

  const updateUnit = (id: string, field: string, value: any) => {
    setUnits(units.map((u) => (u.id === id ? { ...u, [field]: value } : u)))
  }

  const deleteUnit = (id: string) => {
    setUnits(units.filter((u) => u.id !== id))
  }

  const addUnit = () => {
    setUnits([
      ...units,
      {
        id: Date.now().toString(),
        number: 1,
        pattern: '',
        price: 10000,
        bedrooms: '2',
        bathrooms: '1',
        floor: '1st',
        sqft: 1000,
      },
    ])
  }

  const totalUnits = units.reduce((sum, u) => sum + u.number, 0)
  const totalRevenue = units.reduce((sum, u) => sum + u.number * u.price, 0)

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-4">Add Units in Bulk</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Add multiple units at once. Example: 10 units @ KES 10,000 + 20 units @ KES 25,000
        </p>
      </div>

      {/* Units Table */}
      <div className="border border-border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Pattern</TableHead>
              <TableHead>Price (KES)</TableHead>
              <TableHead>BR</TableHead>
              <TableHead>BA</TableHead>
              <TableHead>Floor</TableHead>
              <TableHead>Sqft</TableHead>
              <TableHead className="w-12">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((unit) => (
              <TableRow key={unit.id}>
                <TableCell>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={unit.number}
                    onChange={(e) =>
                      updateUnit(unit.id, 'number', parseInt(e.target.value))
                    }
                    className="w-16"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={unit.pattern}
                    onChange={(e) => updateUnit(unit.id, 'pattern', e.target.value)}
                    placeholder="101-110"
                    className="w-24"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={unit.price}
                    onChange={(e) =>
                      updateUnit(unit.id, 'price', parseInt(e.target.value))
                    }
                    className="w-24"
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={unit.bedrooms}
                    onValueChange={(value) =>
                      updateUnit(unit.id, 'bedrooms', value)
                    }
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                      <SelectItem value="4">4</SelectItem>
                      <SelectItem value="5+">5+</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    value={unit.bathrooms}
                    onValueChange={(value) =>
                      updateUnit(unit.id, 'bathrooms', value)
                    }
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3+">3+</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    value={unit.floor}
                    onValueChange={(value) => updateUnit(unit.id, 'floor', value)}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Ground">Ground</SelectItem>
                      <SelectItem value="1st">1st</SelectItem>
                      <SelectItem value="2nd">2nd</SelectItem>
                      <SelectItem value="3rd">3rd</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={unit.sqft}
                    onChange={(e) =>
                      updateUnit(unit.id, 'sqft', parseInt(e.target.value))
                    }
                    className="w-20"
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteUnit(unit.id)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add Row Button */}
      <Button variant="outline" onClick={addUnit} className="gap-2">
        <Plus className="w-4 h-4" />
        Add Another Unit Type
      </Button>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span>Total Units to Create:</span>
            <span className="font-semibold">{totalUnits}</span>
          </div>
          <div className="flex justify-between">
            <span>Total Monthly Revenue:</span>
            <span className="font-semibold">KES {totalRevenue.toLocaleString()}</span>
          </div>
          <div className="text-sm text-muted-foreground pt-2 border-t">
            Breakdown: {units.map((u) => `${u.number} @ KES ${u.price.toLocaleString()}`).join(' + ')}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
