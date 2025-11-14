'use client'

import { ArrowLeft, Building2, Plus, X, Upload, ImageIcon } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import Sidebar from '@/components/dashboard/sidebar'

export default function NewPropertyPage() {
  const [units, setUnits] = useState([{ number: 'A-101', type: '', size: '', rent: '' }])
  const [images, setImages] = useState<string[]>([])

  const addUnit = () => {
    setUnits([...units, { number: '', type: '', size: '', rent: '' }])
  }

  const removeUnit = (index: number) => {
    setUnits(units.filter((_, i) => i !== index))
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      const newImages = Array.from(files).map(file => URL.createObjectURL(file))
      setImages([...images, ...newImages])
    }
  }

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index))
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 ml-16">
        <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/dashboard/properties">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Properties
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Building2 className="h-5 w-5 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold">Add New Property</h1>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Property Images</CardTitle>
              <CardDescription>Upload photos of your property (max 10 images)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {images.map((image, index) => (
                  <div key={index} className="relative group">
                    <img 
                      src={image || "/placeholder.svg"} 
                      alt={`Property ${index + 1}`} 
                      className="w-full h-32 object-cover rounded-lg border-2 border-gray-200"
                    />
                    <button
                      onClick={() => removeImage(index)}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {images.length < 10 && (
                  <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#4682B4] hover:bg-blue-50 transition-colors">
                    <Upload className="h-8 w-8 text-gray-400 mb-2" />
                    <span className="text-sm text-gray-500">Upload Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
              {images.length === 0 && (
                <div className="flex items-center justify-center h-40 border-2 border-dashed border-gray-300 rounded-lg">
                  <div className="text-center">
                    <ImageIcon className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No images uploaded yet</p>
                    <p className="text-xs text-gray-400 mt-1">Click the upload button to add images</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Enter the basic details of your property</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="property-name">Property Name</Label>
                  <Input id="property-name" placeholder="e.g., Kilimani Heights" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="property-type">Property Type</Label>
                  <Select>
                    <SelectTrigger id="property-type">
                      <SelectValue placeholder="Select property type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="apartment">Apartment Building</SelectItem>
                      <SelectItem value="house">Single House</SelectItem>
                      <SelectItem value="villa">Villa</SelectItem>
                      <SelectItem value="commercial">Commercial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Property Description</Label>
                <Textarea 
                  id="description" 
                  placeholder="Describe your property, its features, and amenities..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Location Details */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="text-lg">📍</span>
                <CardTitle>Location Details</CardTitle>
              </div>
              <CardDescription>Provide the property location information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="county">County</Label>
                  <Select>
                    <SelectTrigger id="county">
                      <SelectValue placeholder="Select county" />
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
                  <Select>
                    <SelectTrigger id="area">
                      <SelectValue placeholder="Select area" />
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
                <Label htmlFor="street">Street Address</Label>
                <Input id="street" placeholder="Enter the full street address" />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="latitude">Latitude (Optional)</Label>
                  <Input id="latitude" placeholder="-1.2921" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="longitude">Longitude (Optional)</Label>
                  <Input id="longitude" placeholder="36.8219" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postal">Postal Code</Label>
                  <Input id="postal" placeholder="00100" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Property Features & Amenities */}
          <Card>
            <CardHeader>
              <CardTitle>Property Features & Amenities</CardTitle>
              <CardDescription>Select the features and amenities available</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  'Parking', 'Security Guard', 'CCTV', 'Swimming Pool', 'Gym', 'Elevator',
                  'Generator', 'Water Backup', 'Garden', 'Playground', 'Balcony', 'Pet Friendly',
                  'Laundry', 'Terrace', 'Furnished', 'WiFi', 'Storage', 'Air Conditioning'
                ].map((amenity) => (
                  <div key={amenity} className="flex items-center space-x-2">
                    <Checkbox id={amenity.toLowerCase().replace(' ', '-')} />
                    <Label 
                      htmlFor={amenity.toLowerCase().replace(' ', '-')} 
                      className="text-sm cursor-pointer"
                    >
                      {amenity}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Units Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Units Configuration</CardTitle>
              <CardDescription>Add the units available in this property</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {units.map((unit, index) => (
                <div key={index} className="p-4 border rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Unit {index + 1}</h4>
                    {units.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeUnit(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Unit Number</Label>
                      <Input placeholder="A-101" value={unit.number} />
                    </div>
                    <div className="space-y-2">
                      <Label>Unit Type</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="studio">Studio</SelectItem>
                          <SelectItem value="1br">1 Bedroom</SelectItem>
                          <SelectItem value="2br">2 Bedroom</SelectItem>
                          <SelectItem value="3br">3 Bedroom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Size (sq ft)</Label>
                      <Input placeholder="800" type="number" value={unit.size} />
                    </div>
                    <div className="space-y-2">
                      <Label>Monthly Rent (KES)</Label>
                      <Input placeholder="45000" type="number" value={unit.rent} />
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="outline" onClick={addUnit} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Another Unit
              </Button>
            </CardContent>
          </Card>

          {/* Management Details */}
          <Card>
            <CardHeader>
              <CardTitle>Management Details</CardTitle>
              <CardDescription>Property management and contact information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="manager-name">Property Manager Name</Label>
                  <Input id="manager-name" placeholder="Jane Wanjiku" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manager-phone">Manager Phone</Label>
                  <Input id="manager-phone" placeholder="254712345678" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manager-email">Manager Email</Label>
                  <Input id="manager-email" type="email" placeholder="jane@property.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emergency">Emergency Contact</Label>
                  <Input id="emergency" placeholder="254712345679" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="office-hours">Office Hours</Label>
                <Input id="office-hours" placeholder="Monday - Friday: 8 AM - 5 PM" />
              </div>
            </CardContent>
          </Card>

          {/* Financial Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Financial Settings</CardTitle>
              <CardDescription>Set up payment and financial preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="deposit">Security Deposit Amount (KES)</Label>
                  <Input id="deposit" placeholder="90000" type="number" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="late-fee">Late Payment Fee (%)</Label>
                  <Input id="late-fee" placeholder="5" type="number" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grace">Grace Period (Days)</Label>
                  <Input id="grace" placeholder="5" type="number" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="due-date">Rent Due Date</Label>
                  <Select>
                    <SelectTrigger id="due-date">
                      <SelectValue placeholder="Select date" />
                    </SelectTrigger>
                    <SelectContent>
                      {[...Array(28)].map((_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {i + 1}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="utilities" />
                <Label htmlFor="utilities" className="cursor-pointer">
                  Utilities included in rent
                </Label>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3 pb-8">
            <Button className="flex-1 bg-[#4682B4] hover:bg-[#4682B4]/90" size="lg">
              Save Property
            </Button>
            <Button variant="outline" size="lg">
              Save as Draft
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
