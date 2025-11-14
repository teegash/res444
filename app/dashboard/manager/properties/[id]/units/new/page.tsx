'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Home, ArrowLeft } from 'lucide-react'

export default function AddUnitPage() {
  const router = useRouter()
  const params = useParams()
  const [features, setFeatures] = useState({
    balcony: false,
    furnished: false,
    wifi: false,
    parking: false,
    pets: false,
    utilities: false
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Handle form submission
    router.push(`/dashboard/manager/properties/${params.id}/units`)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Home className="w-7 h-7 text-blue-600" />
          <div>
            <div className="text-sm text-gray-500">Kilimani Heights</div>
            <h1 className="text-2xl font-bold text-gray-900">Add New Unit</h1>
          </div>
        </div>
      </div>

      <Card className="p-8 bg-gradient-to-br from-blue-50 to-white">
        <div className="bg-blue-600 text-white rounded-t-lg p-6 -m-8 mb-8">
          <div className="flex items-center gap-3">
            <Home className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">Add New Unit</h2>
              <p className="text-sm text-blue-100">Enter details for the new rental unit</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unitNumber">Unit Number</Label>
              <Input id="unitNumber" placeholder="e.g. A-101" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="floor">Floor</Label>
              <Input id="floor" placeholder="e.g. 1st Floor" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unitType">Unit Type</Label>
              <Select>
                <SelectTrigger id="unitType">
                  <SelectValue placeholder="Select unit type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="studio">Studio</SelectItem>
                  <SelectItem value="1bed">1 Bedroom</SelectItem>
                  <SelectItem value="2bed">2 Bedroom</SelectItem>
                  <SelectItem value="3bed">3 Bedroom</SelectItem>
                  <SelectItem value="penthouse">Penthouse</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="size">Size (sq ft)</Label>
              <Input id="size" type="number" placeholder="e.g. 900" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rent">Monthly Rent (KES)</Label>
              <Input id="rent" type="number" placeholder="e.g. 45000" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deposit">Security Deposit (KES)</Label>
              <Input id="deposit" type="number" placeholder="e.g. 45000" required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Unit Status</Label>
            <Select>
              <SelectTrigger id="status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="occupied">Occupied</SelectItem>
                <SelectItem value="maintenance">Under Maintenance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bedrooms">Bedrooms</Label>
              <Input id="bedrooms" type="number" placeholder="e.g. 2" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bathrooms">Bathrooms</Label>
              <Input id="bathrooms" type="number" placeholder="e.g. 1" required />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Features</Label>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(features).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <Label htmlFor={key} className="capitalize cursor-pointer">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </Label>
                  <Switch
                    id={key}
                    checked={value}
                    onCheckedChange={(checked) => setFeatures(prev => ({ ...prev, [key]: checked }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Unit Description</Label>
            <Textarea
              id="description"
              placeholder="Describe the unit features, condition, etc."
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700">
              Add Unit
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
