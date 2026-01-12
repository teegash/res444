'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Building2, Save, CheckCircle2 } from 'lucide-react'
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
import { SuccessModal } from '@/components/ui/success-modal'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
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

export default function AddUnitsPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [successModal, setSuccessModal] = useState<{
    title: string
    description: string
    action: 'close' | 'view_properties'
  } | null>(null)
  const [propertyData, setPropertyData] = useState<any>(null)
  const [units, setUnits] = useState<UnitType[]>([
    {
      id: '1',
      number: 1,
      pattern: '',
      price: 10000,
      bedrooms: '2',
      bathrooms: '1',
      floor: '1st',
      sqft: 1000,
    },
  ])

  // Load property data from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem('newProperty')
    if (stored) {
      try {
        const data = JSON.parse(stored)
        setPropertyData(data)
      } catch (error) {
        console.error('Error parsing property data:', error)
        router.push('/dashboard/properties/new')
      }
    } else {
      // No property data found, redirect back
      router.push('/dashboard/properties/new')
    }
  }, [router])

  const updateUnit = (id: string, field: string, value: any) => {
    setUnits(units.map((u) => (u.id === id ? { ...u, [field]: value } : u)))
  }

  const deleteUnit = (id: string) => {
    if (units.length > 1) {
      setUnits(units.filter((u) => u.id !== id))
    }
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

  const handleBack = () => {
    router.push('/dashboard/properties/new')
  }

  const handleSaveDraft = async () => {
    setIsLoading(true)
    try {
      // TODO: Save as draft to database via API
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setSuccessModal({
        title: 'Draft saved',
        description: 'Your unit draft is saved. You can continue editing whenever you are ready.',
        action: 'close',
      })
    } catch (error) {
      console.error('Error saving draft:', error)
      alert('Failed to save draft. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate units
    if (units.length === 0 || totalUnits === 0) {
      alert('Please add at least one unit.')
      return
    }

    setIsLoading(true)

    try {
      // TODO: Save property and units to database via API
      const data = {
        property: propertyData,
        units: units,
      }

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1500))

      // Clear session storage
      sessionStorage.removeItem('newProperty')

      // Show success message and redirect
      setSuccessModal({
        title: 'Property created',
        description: 'Your property and units were saved successfully.',
        action: 'view_properties',
      })
    } catch (error) {
      console.error('Error creating property:', error)
      alert('Failed to create property. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!propertyData) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header />
          <main className="flex-1 p-6 overflow-auto flex items-center justify-center">
            <div className="text-center">
              <p className="text-gray-600">Loading...</p>
            </div>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBack}
                className="h-10 w-10"
                aria-label="Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#4682B4] rounded-lg flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">
                    {propertyData.buildingName || 'Add Units'}
                  </h1>
                  <p className="text-sm text-gray-600 mt-1">
                    Step 2 of 2: Add Apartment Units
                  </p>
                </div>
              </div>
            </div>

            {/* Property Info Summary */}
            <Card className="border border-gray-200 shadow-sm bg-gray-50">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600 font-medium">Location:</span>
                    <p className="text-gray-900 mt-1">{propertyData.location || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-gray-600 font-medium">County:</span>
                    <p className="text-gray-900 mt-1 capitalize">{propertyData.county || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-gray-600 font-medium">Manager:</span>
                    <p className="text-gray-900 mt-1">{propertyData.manager || 'Not assigned'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Header Section */}
              <div className="border-b border-gray-200 pb-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Add Units in Bulk</h2>
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
                                required
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
                                required
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
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteUnit(unit.id)}
                                disabled={units.length === 1}
                                className="h-8 w-8 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                title={units.length === 1 ? 'At least one unit type is required' : 'Delete unit type'}
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
                    type="button"
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

              {/* Action Buttons */}
              <div className="flex justify-between gap-3 pt-4 border-t border-gray-200">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Back"
                  onClick={handleBack}
                  disabled={isLoading}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSaveDraft}
                    className="min-w-[130px] gap-2"
                    disabled={isLoading}
                  >
                    <Save className="w-4 h-4" />
                    Save as Draft
                  </Button>
                  <Button
                    type="submit"
                    className="min-w-[180px] bg-[#4682B4] hover:bg-[#4682B4]/90 gap-2"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>Processing...</>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Create Property & Units
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </main>
        <SuccessModal
          open={Boolean(successModal)}
          onOpenChange={(open) => {
            if (!open) setSuccessModal(null)
          }}
          title={successModal?.title || 'Success'}
          description={successModal?.description}
          details={[{ label: 'Property', value: propertyData?.buildingName || '-' }]}
          primaryAction={{
            label: successModal?.action === 'view_properties' ? 'View properties' : 'Done',
            onClick: () => {
              if (successModal?.action === 'view_properties') {
                setSuccessModal(null)
                router.push('/dashboard/properties')
                return
              }
              setSuccessModal(null)
            },
            className:
              successModal?.action === 'view_properties'
                ? 'bg-[#4682B4] hover:bg-[#375f84]'
                : undefined,
          }}
        />
      </div>
    </div>
  )
}
