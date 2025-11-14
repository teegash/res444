'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Lock, Info } from 'lucide-react'

interface AddTenantModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface TenantForm {
  fullName: string
  email: string
  phone: string
  nationalId: string
  dob: string
  address: string
  propertyId: string | null
  unitId: string | null
}

interface PropertyData {
  id: string
  name: string
}

interface UnitData {
  id: string
  number: string
  building: string
  property: string
  price: number
  bedrooms: number
  bathrooms: number
  floor: string
  sqft: number
}

export function AddTenantModal({ open, onOpenChange }: AddTenantModalProps) {
  const [form, setForm] = useState<TenantForm>({
    fullName: '',
    email: '',
    phone: '',
    nationalId: '',
    dob: '',
    address: '',
    propertyId: null,
    unitId: null,
  })

  const [selectedUnit, setSelectedUnit] = useState<UnitData | null>(null)
  const [loading, setLoading] = useState(false)

  const properties: PropertyData[] = [
    { id: '1', name: 'Alpha Complex' },
    { id: '2', name: 'Beta Towers' },
    { id: '3', name: 'Gamma Heights' },
  ]

  const unitsByProperty: Record<string, UnitData[]> = {
    '1': [
      {
        id: '1',
        number: 'Unit 101',
        building: 'Alpha Complex',
        property: '1',
        price: 10000,
        bedrooms: 2,
        bathrooms: 1,
        floor: '1st',
        sqft: 900,
      },
      {
        id: '2',
        number: 'Unit 102',
        building: 'Alpha Complex',
        property: '1',
        price: 10000,
        bedrooms: 2,
        bathrooms: 1,
        floor: '1st',
        sqft: 900,
      },
    ],
    '2': [
      {
        id: '3',
        number: 'Unit 205',
        building: 'Beta Towers',
        property: '2',
        price: 25000,
        bedrooms: 3,
        bathrooms: 2,
        floor: '2nd',
        sqft: 1400,
      },
    ],
    '3': [
      {
        id: '4',
        number: 'Unit 301',
        building: 'Gamma Heights',
        property: '3',
        price: 15000,
        bedrooms: 2,
        bathrooms: 2,
        floor: '3rd',
        sqft: 1100,
      },
    ],
  }

  const handlePropertyChange = (propertyId: string) => {
    setForm({ ...form, propertyId, unitId: null })
    setSelectedUnit(null)
  }

  const handleUnitChange = (unitId: string) => {
    const unit = selectedUnit ? unitsByProperty[form.propertyId!]?.find(u => u.id === unitId) : null
    if (form.propertyId) {
      const foundUnit = unitsByProperty[form.propertyId].find(u => u.id === unitId)
      setSelectedUnit(foundUnit || null)
      setForm({ ...form, unitId })
    }
  }

  const leaseStartDate = new Date().toISOString().split('T')[0]
  const leaseEndDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1))
    .toISOString()
    .split('T')[0]

  const handleSubmit = async () => {
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      onOpenChange(false)
    }, 2000)
  }

  const isFormValid = form.fullName && form.email && form.phone && form.unitId
  const availableUnits = form.propertyId ? unitsByProperty[form.propertyId] || [] : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Tenant</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Section 1: Tenant Information */}
          <div className="space-y-4">
            <h3 className="font-semibold">Tenant Information</h3>
            <div>
              <Label htmlFor="full-name">Full Name *</Label>
              <Input
                id="full-name"
                placeholder="John Doe"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone Number *</Label>
              <Input
                id="phone"
                placeholder="+254712345678"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="national-id">National ID *</Label>
              <Input
                id="national-id"
                placeholder="12345678"
                value={form.nationalId}
                onChange={(e) => setForm({ ...form, nationalId: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="dob">Date of Birth</Label>
              <Input
                id="dob"
                type="date"
                value={form.dob}
                onChange={(e) => setForm({ ...form, dob: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="address">Current Address</Label>
              <Textarea
                id="address"
                placeholder="Current residential address..."
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </div>

          {/* Section 2: Property and Unit Selection - Cascading */}
          <div className="space-y-4">
            <h3 className="font-semibold">Property & Unit Assignment</h3>

            <div>
              <Label htmlFor="property">Select Property *</Label>
              <Select value={form.propertyId || ''} onValueChange={handlePropertyChange}>
                <SelectTrigger id="property">
                  <SelectValue placeholder="Select a property..." />
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

            {form.propertyId && (
              <div>
                <Label htmlFor="unit">Select Apartment Unit *</Label>
                <Select value={form.unitId || ''} onValueChange={handleUnitChange}>
                  <SelectTrigger id="unit">
                    <SelectValue placeholder="Select a vacant unit..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableUnits.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.number} ({unit.bedrooms}BR/{unit.bathrooms}BA) - KES {unit.price.toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Section 3: Auto-Populated Lease Fields */}
          {selectedUnit && (
            <div className="space-y-4">
              <h3 className="font-semibold">Lease Information</h3>
              <div className="space-y-3">
                {/* Monthly Rent */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Monthly Rent (KES)</Label>
                    <Lock className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <Input
                    disabled
                    value={`KES ${selectedUnit.price.toLocaleString()}`}
                    className="bg-muted cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Auto-populated from unit (cannot edit)
                  </p>
                </div>

                {/* Deposit Amount */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Deposit Amount (KES)</Label>
                    <Lock className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <Input
                    disabled
                    value={`KES ${selectedUnit.price.toLocaleString()}`}
                    className="bg-muted cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Equals 1 month rent (cannot edit)
                  </p>
                </div>

                {/* Lease Start Date */}
                <div>
                  <Label htmlFor="start-date">Lease Start Date</Label>
                  <Input id="start-date" type="date" defaultValue={leaseStartDate} />
                </div>

                {/* Lease End Date */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Lease End Date</Label>
                    <Lock className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <Input
                    disabled
                    value={leaseEndDate}
                    className="bg-muted cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Auto-calculated 12 months (cannot edit)
                  </p>
                </div>

                {/* Lease Duration */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Lease Duration</Label>
                    <Lock className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <Input
                    disabled
                    value="12 months"
                    className="bg-muted cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Standard duration (cannot edit)
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Section 4: Optional Fields */}
          <div className="space-y-4">
            <h3 className="font-semibold">Additional Information</h3>
            <div>
              <Label htmlFor="notes">Special Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any special arrangements or notes..."
                className="h-24"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isFormValid || loading}
              className="gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Creating tenant...
                </>
              ) : (
                'Add Tenant & Create Lease'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
