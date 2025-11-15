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
      {/* Header Section */}
      <div className="border-b border-gray-200 pb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Add Units in Bulk</h3>
        <p className="text-sm text-gray-600">
          Add multiple units at once with shared specifications. Example: 10 units @ KES 10,000 + 20 units @ KES 25,000
        </p>
      </div>

      {/* Units Table Card */}
      <Card className="border border-gray-200 shadow-sm">
        <CardHeader className="bg-gray-50 border-b border-gray-200">
          <CardTitle className="text-base font-semibold text-gray-900">Unit Types</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 hover:bg-gray-50">
                  <TableHead className="font-semibold text-gray-700">No. of Units</TableHead>
                  <TableHead className="font-semibold text-gray-700">Unit Pattern</TableHead>
                  <TableHead className="font-semibold text-gray-700">Monthly Rent (KES)</TableHead>
                  <TableHead className="font-semibold text-gray-700">Bedrooms</TableHead>
                  <TableHead className="font-semibold text-gray-700">Bathrooms</TableHead>
                  <TableHead className="font-semibold text-gray-700">Floor</TableHead>
                  <TableHead className="font-semibold text-gray-700">Size (sqft)</TableHead>
                  <TableHead className="w-16 text-center font-semibold text-gray-700">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((unit, index) => (
                  <TableRow key={unit.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <TableCell className="py-3">
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        value={unit.number}
                        onChange={(e) =>
                          updateUnit(unit.id, 'number', parseInt(e.target.value) || 0)
                        }
                        className="w-20 font-medium"
                      />
                    </TableCell>
                    <TableCell className="py-3">
                      <Input
                        value={unit.pattern}
                        onChange={(e) => updateUnit(unit.id, 'pattern', e.target.value)}
                        placeholder="e.g., 101-110"
                        className="w-32"
                      />
                    </TableCell>
                    <TableCell className="py-3">
                      <Input
                        type="number"
                        min="0"
                        value={unit.price}
                        onChange={(e) =>
                          updateUnit(unit.id, 'price', parseInt(e.target.value) || 0)
                        }
                        className="w-32 font-medium"
                      />
                    </TableCell>
                    <TableCell className="py-3">
                      <Select
                        value={unit.bedrooms}
                        onValueChange={(value) =>
                          updateUnit(unit.id, 'bedrooms', value)
                        }
                      >
                        <SelectTrigger className="w-24">
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
                    <TableCell className="py-3">
                      <Select
                        value={unit.bathrooms}
                        onValueChange={(value) =>
                          updateUnit(unit.id, 'bathrooms', value)
                        }
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1</SelectItem>
                          <SelectItem value="2">2</SelectItem>
                          <SelectItem value="3+">3+</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="py-3">
                      <Select
                        value={unit.floor}
                        onValueChange={(value) => updateUnit(unit.id, 'floor', value)}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Ground">Ground</SelectItem>
                          <SelectItem value="1st">1st</SelectItem>
                          <SelectItem value="2nd">2nd</SelectItem>
                          <SelectItem value="3rd">3rd</SelectItem>
                          <SelectItem value="4th">4th</SelectItem>
                          <SelectItem value="5th+">5th+</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="py-3">
                      <Input
                        type="number"
                        min="0"
                        value={unit.sqft}
                        onChange={(e) =>
                          updateUnit(unit.id, 'sqft', parseInt(e.target.value) || 0)
                        }
                        className="w-24"
                      />
                    </TableCell>
                    <TableCell className="py-3 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteUnit(unit.id)}
                        className="h-8 w-8 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <Button 
            variant="outline" 
            onClick={addUnit} 
            className="gap-2 w-full sm:w-auto border-gray-300 hover:bg-gray-100"
          >
            <Plus className="w-4 h-4" />
            Add Another Unit Type
          </Button>
        </div>
      </Card>

      {/* Summary Card */}
      <Card className="border border-gray-200 shadow-sm bg-gradient-to-br from-blue-50 to-indigo-50">
        <CardHeader className="border-b border-gray-200">
          <CardTitle className="text-base font-semibold text-gray-900">Summary</CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="flex justify-between items-center py-2 border-b border-gray-200">
            <span className="text-gray-700 font-medium">Total Units to Create:</span>
            <span className="text-lg font-bold text-[#4682B4]">{totalUnits}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-200">
            <span className="text-gray-700 font-medium">Estimated Monthly Revenue:</span>
            <span className="text-lg font-bold text-green-600">KES {totalRevenue.toLocaleString()}</span>
          </div>
          {units.length > 0 && (
            <div className="pt-2">
              <p className="text-sm text-gray-600 mb-2 font-medium">Breakdown:</p>
              <div className="flex flex-wrap gap-2">
                {units.map((u, idx) => (
                  <span
                    key={u.id}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-white border border-gray-200 text-gray-700"
                  >
                    {u.number} unit{u.number > 1 ? 's' : ''} @ KES {u.price.toLocaleString()}
                    {idx < units.length - 1 && <span className="ml-2 text-gray-400">+</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
