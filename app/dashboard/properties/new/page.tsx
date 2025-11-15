'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Building2 } from 'lucide-react'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'

export default function NewPropertyPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    buildingName: '',
    location: '',
    county: '',
    manager: '',
    description: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.buildingName.trim()) {
      newErrors.buildingName = 'Building name is required'
    }

    if (!formData.location.trim()) {
      newErrors.location = 'Location/Address is required'
    }

    if (!formData.county) {
      newErrors.county = 'County is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsLoading(true)

    try {
      // TODO: Save property data to database via API
      // Store in session/localStorage for now to pass to units page
      const propertyData = {
        ...formData,
        // Add timestamp for unique identification
        timestamp: Date.now(),
      }
      sessionStorage.setItem('newProperty', JSON.stringify(propertyData))

      // Navigate to units page
      router.push('/dashboard/properties/new/units')
    } catch (error) {
      console.error('Error saving property:', error)
      alert('Failed to save property. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    router.push('/dashboard/properties')
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCancel}
                className="h-10 w-10"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#4682B4] rounded-lg flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Add New Property</h1>
                  <p className="text-sm text-gray-600 mt-1">
                    Step 1 of 2: Building Information
                  </p>
                </div>
              </div>
            </div>

            {/* Form Card */}
            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="border-b border-gray-200 bg-gray-50">
                <CardTitle className="text-xl font-semibold text-gray-900">
                  Building Information
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Building Name */}
                  <div className="space-y-2">
                    <Label htmlFor="building-name" className="text-sm font-medium text-gray-700">
                      Building Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="building-name"
                      placeholder="e.g., Alpha Complex"
                      value={formData.buildingName}
                      onChange={(e) => handleChange('buildingName', e.target.value)}
                      className={errors.buildingName ? 'border-red-500' : ''}
                    />
                    {errors.buildingName && (
                      <p className="text-sm text-red-500">{errors.buildingName}</p>
                    )}
                  </div>

                  {/* Location/Address */}
                  <div className="space-y-2">
                    <Label htmlFor="location" className="text-sm font-medium text-gray-700">
                      Location/Address <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="location"
                      placeholder="Full address including street, area, and landmarks..."
                      value={formData.location}
                      onChange={(e) => handleChange('location', e.target.value)}
                      rows={3}
                      className={errors.location ? 'border-red-500' : ''}
                    />
                    {errors.location && (
                      <p className="text-sm text-red-500">{errors.location}</p>
                    )}
                  </div>

                  {/* County and Manager in Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* County */}
                    <div className="space-y-2">
                      <Label htmlFor="county" className="text-sm font-medium text-gray-700">
                        County <span className="text-red-500">*</span>
                      </Label>
                      <Select
                        value={formData.county}
                        onValueChange={(value) => handleChange('county', value)}
                      >
                        <SelectTrigger id="county" className={errors.county ? 'border-red-500' : ''}>
                          <SelectValue placeholder="Select county..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nairobi">Nairobi</SelectItem>
                          <SelectItem value="mombasa">Mombasa</SelectItem>
                          <SelectItem value="kisumu">Kisumu</SelectItem>
                          <SelectItem value="nakuru">Nakuru</SelectItem>
                          <SelectItem value="eldoret">Eldoret</SelectItem>
                          <SelectItem value="thika">Thika</SelectItem>
                          <SelectItem value="malindi">Malindi</SelectItem>
                          <SelectItem value="kisii">Kisii</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      {errors.county && (
                        <p className="text-sm text-red-500">{errors.county}</p>
                      )}
                    </div>

                    {/* Manager Assignment */}
                    <div className="space-y-2">
                      <Label htmlFor="manager" className="text-sm font-medium text-gray-700">
                        Manager Assignment
                        <span className="text-xs text-gray-500 ml-1">(Optional)</span>
                      </Label>
                      <Select
                        value={formData.manager}
                        onValueChange={(value) => handleChange('manager', value)}
                      >
                        <SelectTrigger id="manager">
                          <SelectValue placeholder="Select manager..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manager1">Manager 1</SelectItem>
                          <SelectItem value="manager2">Manager 2</SelectItem>
                          <SelectItem value="none">Assign Later</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <Label htmlFor="description" className="text-sm font-medium text-gray-700">
                      Description
                      <span className="text-xs text-gray-500 ml-1">(Optional)</span>
                    </Label>
                    <Textarea
                      id="description"
                      placeholder="Describe the building, its features, amenities, and any other relevant details..."
                      value={formData.description}
                      onChange={(e) => handleChange('description', e.target.value)}
                      rows={4}
                    />
                    <p className="text-xs text-gray-500">
                      This information will help potential tenants understand what the property offers.
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCancel}
                      className="min-w-[100px]"
                      disabled={isLoading}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="min-w-[140px] bg-[#4682B4] hover:bg-[#4682B4]/90"
                      disabled={isLoading}
                    >
                      {isLoading ? 'Saving...' : 'Next: Add Units'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Help Card */}
            <Card className="border border-blue-200 bg-blue-50/50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-blue-600 text-xs font-bold">ℹ</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-blue-900">What's Next?</p>
                    <p className="text-sm text-blue-700">
                      After saving the building information, you'll be taken to the next step where you can add apartment units in bulk. 
                      You can specify different unit types (e.g., 10 units @ KES 10,000, 5 units @ KES 15,000) and their specifications.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  )
}

