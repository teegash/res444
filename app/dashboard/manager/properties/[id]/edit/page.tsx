'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Building2, ArrowLeft, MapPin } from 'lucide-react'

export default function EditPropertyPage() {
  const router = useRouter()
  const params = useParams()
  const [amenities, setAmenities] = useState({
    parking: true,
    securityGuard: true,
    cctv: true,
    swimmingPool: true,
    gym: true,
    elevator: true,
    generator: true,
    playground: false,
    balcony: false,
    waterBackup: false,
    laundry: false,
    terrace: false,
    petFriendly: false,
    furnished: false,
    garden: false,
    wifi: false,
    storage: false,
    airConditioning: false
  })

  const [paymentMethods, setPaymentMethods] = useState({
    mpesa: true,
    bankTransfer: true,
    cash: true,
    cheque: true
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    router.push(`/dashboard/manager/properties/${params.id}`)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Building2 className="w-7 h-7 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Edit Property</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <Card className="p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Basic Information</h2>
          <p className="text-sm text-gray-600 mb-6">Update the basic details of your property</p>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Property Name</Label>
                <Input id="name" defaultValue="Kilimani Heights" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Property Type</Label>
                <Select defaultValue="apartment">
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="apartment">Apartment Complex</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="townhouse">Townhouse</SelectItem>
                    <SelectItem value="villa">Villa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Property Description</Label>
              <Textarea
                id="description"
                defaultValue="Modern apartment complex with excellent amenities and prime location in Kilimani."
                rows={3}
                className="resize-none"
              />
            </div>
          </div>
        </Card>

        {/* Location Details */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <MapPin className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-lg font-bold text-gray-900">Location Details</h2>
              <p className="text-sm text-gray-600">Update the property location information</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="county">County</Label>
                <Select defaultValue="nairobi">
                  <SelectTrigger id="county">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nairobi">Nairobi</SelectItem>
                    <SelectItem value="mombasa">Mombasa</SelectItem>
                    <SelectItem value="kisumu">Kisumu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="area">Area/Neighborhood</Label>
                <Select defaultValue="kilimani">
                  <SelectTrigger id="area">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kilimani">Kilimani</SelectItem>
                    <SelectItem value="westlands">Westlands</SelectItem>
                    <SelectItem value="karen">Karen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Street Address</Label>
              <Input id="address" defaultValue="123 Kilimani Road, Nairobi" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="postal">Postal Code</Label>
              <Input id="postal" defaultValue="00100" required />
            </div>
          </div>
        </Card>

        {/* Property Features & Amenities */}
        <Card className="p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Property Features & Amenities</h2>
          <p className="text-sm text-gray-600 mb-6">Update the features and amenities available</p>

          <div className="grid grid-cols-3 gap-4">
            {Object.entries(amenities).map(([key, value]) => (
              <div key={key} className="flex items-center space-x-2">
                <Checkbox
                  id={key}
                  checked={value}
                  onCheckedChange={(checked) => setAmenities(prev => ({ ...prev, [key]: checked as boolean }))}
                />
                <Label htmlFor={key} className="cursor-pointer capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </Label>
              </div>
            ))}
          </div>
        </Card>

        {/* Management Details */}
        <Card className="p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Management Details</h2>
          <p className="text-sm text-gray-600 mb-6">Update property management and contact information</p>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="managerName">Property Manager Name</Label>
                <Input id="managerName" defaultValue="Jane Wanjiku" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="managerPhone">Manager Phone</Label>
                <Input id="managerPhone" defaultValue="254712345678" required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="managerEmail">Manager Email</Label>
                <Input id="managerEmail" type="email" defaultValue="jane@kilimaniheights.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emergency">Emergency Contact</Label>
                <Input id="emergency" defaultValue="254712345679" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hours">Office Hours</Label>
              <Input id="hours" defaultValue="Monday - Friday: 8 AM - 5 PM" required />
            </div>
          </div>
        </Card>

        {/* Financial Settings */}
        <Card className="p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Financial Settings</h2>
          <p className="text-sm text-gray-600 mb-6">Update payment and financial preferences</p>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="deposit">Security Deposit (Months)</Label>
                <Select defaultValue="2">
                  <SelectTrigger id="deposit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 Month</SelectItem>
                    <SelectItem value="2">2 Months</SelectItem>
                    <SelectItem value="3">3 Months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lateFee">Late Fee (KES)</Label>
                <Input id="lateFee" type="number" defaultValue="2000" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grace">Grace Period (Days)</Label>
                <Input id="grace" type="number" defaultValue="5" required />
              </div>
            </div>

            <div className="space-y-3">
              <Label>Accepted Payment Methods</Label>
              <div className="grid grid-cols-4 gap-4">
                {Object.entries(paymentMethods).map(([key, value]) => (
                  <div key={key} className="flex items-center space-x-2">
                    <Checkbox
                      id={`payment-${key}`}
                      checked={value}
                      onCheckedChange={(checked) => setPaymentMethods(prev => ({ ...prev, [key]: checked as boolean }))}
                    />
                    <Label htmlFor={`payment-${key}`} className="cursor-pointer capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" className="flex-1 bg-gray-900 hover:bg-gray-800">
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  )
}
