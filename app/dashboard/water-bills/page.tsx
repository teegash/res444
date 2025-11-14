'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Droplet, Send, Calculator } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'

export default function WaterBillsPage() {
  const [selectedProperty, setSelectedProperty] = useState('')
  const [selectedUnit, setSelectedUnit] = useState('')
  const [previousReading, setPreviousReading] = useState('')
  const [currentReading, setCurrentReading] = useState('')
  const [pricePerUnit, setPricePerUnit] = useState('85')
  
  const properties = [
    { id: '1', name: 'Kilimani Heights' },
    { id: '2', name: 'Westlands Plaza' },
    { id: '3', name: 'Karen Villas' },
    { id: '4', name: 'Eastlands Court' },
  ]

  const units: Record<string, Array<{ id: string; number: string; tenant: string; email: string; phone: string; previousReading: number }>> = {
    '1': [
      { id: '1', number: 'A-101', tenant: 'John Kamau', email: 'john.kamau@email.com', phone: '+254 712 345 678', previousReading: 1250 },
      { id: '2', number: 'A-102', tenant: 'Mary Wanjiku', email: 'mary.w@email.com', phone: '+254 723 456 789', previousReading: 980 },
      { id: '3', number: 'A-103', tenant: 'Peter Ochieng', email: 'peter.o@email.com', phone: '+254 734 567 890', previousReading: 1100 },
    ],
    '2': [
      { id: '4', number: 'B-201', tenant: 'Grace Akinyi', email: 'grace.a@email.com', phone: '+254 745 678 901', previousReading: 850 },
      { id: '5', number: 'B-202', tenant: 'David Mwangi', email: 'david.m@email.com', phone: '+254 756 789 012', previousReading: 1320 },
    ],
    '3': [
      { id: '6', number: 'C-301', tenant: 'Sarah Njeri', email: 'sarah.n@email.com', phone: '+254 767 890 123', previousReading: 920 },
      { id: '7', number: 'C-302', tenant: 'James Kibet', email: 'james.k@email.com', phone: '+254 778 901 234', previousReading: 1050 },
    ],
    '4': [
      { id: '8', number: 'D-101', tenant: 'Anne Wangari', email: 'anne.w@email.com', phone: '+254 789 012 345', previousReading: 1180 },
      { id: '9', number: 'D-102', tenant: 'Robert Otieno', email: 'robert.o@email.com', phone: '+254 790 123 456', previousReading: 870 },
    ],
  }

  const selectedUnitData = selectedProperty && selectedUnit
    ? units[selectedProperty]?.find(u => u.id === selectedUnit)
    : null

  const unitsConsumed = currentReading && previousReading
    ? Math.max(0, parseFloat(currentReading) - parseFloat(previousReading))
    : 0
  
  const totalAmount = unitsConsumed * parseFloat(pricePerUnit || '0')

  const handleUnitChange = (unitId: string) => {
    setSelectedUnit(unitId)
    const unit = selectedProperty ? units[selectedProperty]?.find(u => u.id === unitId) : null
    if (unit) {
      setPreviousReading(unit.previousReading.toString())
    }
  }

  const handleSendInvoice = () => {
    // Handle sending invoice logic here
    alert(`Invoice sent to ${selectedUnitData?.tenant}`)
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 p-8 ml-16">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Droplet className="h-6 w-6 text-[#4682B4]" />
            </div>
            <h1 className="text-3xl font-bold">Create Water Bill Invoice</h1>
          </div>
          <p className="text-muted-foreground">Generate and send water bill invoices to tenants</p>
        </div>

        <div className="max-w-4xl">
          <Card>
            <CardHeader className="bg-gradient-to-r from-[#4682B4] to-[#5a9fd4] text-white">
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Water Consumption Invoice Form
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {/* Property and Unit Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="property">Select Property *</Label>
                  <Select value={selectedProperty} onValueChange={(value) => {
                    setSelectedProperty(value)
                    setSelectedUnit('')
                    setPreviousReading('')
                    setCurrentReading('')
                  }}>
                    <SelectTrigger id="property" className="h-12">
                      <SelectValue placeholder="Choose property" />
                    </SelectTrigger>
                    <SelectContent>
                      {properties.map((property) => (
                        <SelectItem key={property.id} value={property.id}>
                          {property.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="unit">Select Apartment Unit *</Label>
                  <Select 
                    value={selectedUnit} 
                    onValueChange={handleUnitChange}
                    disabled={!selectedProperty}
                  >
                    <SelectTrigger id="unit" className="h-12">
                      <SelectValue placeholder={selectedProperty ? "Choose unit" : "Select property first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedProperty && units[selectedProperty]?.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          Unit {unit.number} - {unit.tenant}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Tenant Details - Auto-filled */}
              {selectedUnitData && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                  <h3 className="font-semibold text-[#4682B4] flex items-center gap-2">
                    Tenant Details (Auto-filled)
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Tenant Name</Label>
                      <div className="mt-1 p-3 bg-white border rounded-md font-medium">
                        {selectedUnitData.tenant}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Unit Number</Label>
                      <div className="mt-1 p-3 bg-white border rounded-md font-medium">
                        {selectedUnitData.number}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Email Address</Label>
                      <div className="mt-1 p-3 bg-white border rounded-md">
                        {selectedUnitData.email}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Phone Number</Label>
                      <div className="mt-1 p-3 bg-white border rounded-md">
                        {selectedUnitData.phone}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Water Consumption Details */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Water Consumption Details</h3>
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="previous">Previous Reading *</Label>
                    <Input
                      id="previous"
                      type="number"
                      placeholder="0"
                      value={previousReading}
                      onChange={(e) => setPreviousReading(e.target.value)}
                      className="h-12 text-lg"
                      disabled={!selectedUnit}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="current">Current Reading *</Label>
                    <Input
                      id="current"
                      type="number"
                      placeholder="0"
                      value={currentReading}
                      onChange={(e) => setCurrentReading(e.target.value)}
                      className="h-12 text-lg"
                      disabled={!selectedUnit}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="price">Price per Unit (KES) *</Label>
                    <Input
                      id="price"
                      type="number"
                      placeholder="85"
                      value={pricePerUnit}
                      onChange={(e) => setPricePerUnit(e.target.value)}
                      className="h-12 text-lg"
                      disabled={!selectedUnit}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Add any additional notes or remarks for this invoice..."
                    rows={3}
                    disabled={!selectedUnit}
                  />
                </div>
              </div>

              {/* Calculation Summary */}
              {selectedUnit && (
                <div className="p-6 bg-gradient-to-br from-green-50 to-blue-50 border-2 border-[#4682B4] rounded-lg space-y-3">
                  <h3 className="font-semibold text-lg text-[#4682B4]">Invoice Summary</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-muted-foreground">Units Consumed:</span>
                      <span className="text-xl font-bold">{unitsConsumed.toFixed(2)} units</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-muted-foreground">Rate per Unit:</span>
                      <span className="text-xl font-bold">KES {parseFloat(pricePerUnit || '0').toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-3">
                      <span className="text-lg font-semibold">Total Amount:</span>
                      <span className="text-3xl font-bold text-[#4682B4]">
                        KES {totalAmount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-4 pt-4">
                <Button
                  className="flex-1 h-12 text-lg bg-[#4682B4] hover:bg-[#4682B4]/90"
                  disabled={!selectedUnit || !currentReading || !previousReading || unitsConsumed <= 0}
                  onClick={handleSendInvoice}
                >
                  <Send className="mr-2 h-5 w-5" />
                  Send Invoice to Tenant
                </Button>
                <Button
                  variant="outline"
                  className="h-12"
                  onClick={() => {
                    setSelectedProperty('')
                    setSelectedUnit('')
                    setPreviousReading('')
                    setCurrentReading('')
                    setPricePerUnit('85')
                  }}
                >
                  Clear Form
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
