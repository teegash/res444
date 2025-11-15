'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Building2, Loader2, Plus, Trash2, CheckCircle2 } from 'lucide-react'
import Sidebar from '@/components/dashboard/sidebar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string | null
      if (!result) {
        reject(new Error('Failed to read file'))
        return
      }
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })

type UnitFormState = {
  unit_number: string
  floor: string
  bedrooms: string
  bathrooms: string
  size_sqft: string
  status: 'vacant' | 'occupied' | 'maintenance'
}

const STATUS_OPTIONS: UnitFormState['status'][] = ['vacant', 'occupied', 'maintenance']

export default function NewPropertyPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    totalUnits: '',
    description: '',
    imageUrl: '',
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      const previewUrl = URL.createObjectURL(file)
      setImagePreview(previewUrl)
      setFormData((prev) => ({
        ...prev,
        imageUrl: '',
      }))
    }
  }

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview)
      }
    }
  }, [imagePreview])

  const [units, setUnits] = useState<UnitFormState[]>([
    { unit_number: '', floor: '', bedrooms: '', bathrooms: '', size_sqft: '', status: 'vacant' },
  ])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    setError(null)
  }

  const handleUnitChange = (
    index: number,
    field: keyof UnitFormState,
    value: string | UnitFormState['status']
  ) => {
    setUnits((prev) =>
      prev.map((unit, i) =>
        i === index
          ? {
              ...unit,
              [field]: value,
            }
          : unit
      )
    )
  }

  const addUnit = () => {
    setUnits((prev) => [
      ...prev,
      { unit_number: '', floor: '', bedrooms: '', bathrooms: '', size_sqft: '', status: 'vacant' },
    ])
  }

  const removeUnit = (index: number) => {
    setUnits((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim() || !formData.location.trim() || !formData.totalUnits.trim()) {
      setError('Property name, location, and total units are required.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const payload = {
        name: formData.name.trim(),
        location: formData.location.trim(),
        total_units: Number(formData.totalUnits),
        description: formData.description.trim() || null,
        image_url: formData.imageUrl.trim() || null,
        image_file: imageFile ? await fileToBase64(imageFile) : null,
        units: units
          .filter((unit) => unit.unit_number.trim().length > 0)
          .map((unit) => ({
            unit_number: unit.unit_number.trim(),
            floor: unit.floor ? Number(unit.floor) : null,
            number_of_bedrooms: unit.bedrooms ? Number(unit.bedrooms) : null,
            number_of_bathrooms: unit.bathrooms ? Number(unit.bathrooms) : null,
            size_sqft: unit.size_sqft ? Number(unit.size_sqft) : null,
            status: unit.status,
          })),
      }

      const response = await fetch('/api/properties/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to save property.')
      }

      setSuccess('Property created successfully.')
      setShowSuccessModal(true)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'An unexpected error occurred while saving.'
      setError(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 ml-16">
        <form
          onSubmit={handleSubmit}
          className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8 space-y-6"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard/manager/properties">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Properties
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Building2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Add Apartment Building</h1>
                  <p className="text-sm text-gray-600">
                    Save the building and optionally pre-create units.
                  </p>
                </div>
              </div>
            </div>
            {isSubmitting && <Loader2 className="h-5 w-5 animate-spin text-[#4682B4]" />}
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {success}
            </div>
          )}

        <Card>
          <CardHeader>
            <CardTitle>Building Details</CardTitle>
            <CardDescription>Provide information that maps to apartment_buildings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Featured Image</Label>
              <div className="flex flex-col md:flex-row gap-4">
                <div
                  className="w-full md:w-1/2 h-48 rounded-lg border border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-[#4682B4] hover:bg-blue-50 transition-colors"
                  onClick={() => document.getElementById('imageUploader')?.click()}
                >
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover rounded-lg" />
                  ) : (
                    <p className="text-sm text-gray-500">Click to upload image</p>
                  )}
                  <input
                    id="imageUploader"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleImageChange}
                  />
                </div>
                <div className="w-full md:w-1/2 space-y-2">
                  <Label htmlFor="image-url">Image URL (optional)</Label>
                  <Input
                    id="image-url"
                    name="imageUrl"
                    placeholder="https://..."
                    value={formData.imageUrl}
                    onChange={handleInputChange}
                    disabled={!!imageFile}
                  />
                  <p className="text-xs text-gray-500">
                    {imageFile
                      ? 'Uploaded file will be used. Remove it if you prefer using a URL.'
                      : 'Provide a public URL or upload an image.'}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                  <Label htmlFor="name">Building Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="e.g., Kilimani Heights"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Location *</Label>
                  <Input
                    id="location"
                    name="location"
                    placeholder="Kilimani, Nairobi"
                    value={formData.location}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="totalUnits">Total Units *</Label>
                  <Input
                    id="totalUnits"
                    name="totalUnits"
                    type="number"
                    min={1}
                    placeholder="e.g., 24"
                    value={formData.totalUnits}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="imageUrl">Featured Image URL (optional)</Label>
                  <Input
                    id="imageUrl"
                    name="imageUrl"
                    placeholder="https://..."
                    value={formData.imageUrl}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Short summary of the building, amenities, or surrounding area..."
                  rows={4}
                  value={formData.description}
                  onChange={handleInputChange}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Units (Optional)</CardTitle>
              <CardDescription>
                These map to apartment_units. Add at least one with a number and status to create it
                now. You can always add or edit units later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {units.map((unit, index) => (
                <div key={index} className="rounded-lg border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-gray-900">Unit {index + 1}</h4>
                    {units.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() => removeUnit(index)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Unit Number *</Label>
                      <Input
                        placeholder="A-101"
                        value={unit.unit_number}
                        onChange={(e) => handleUnitChange(index, 'unit_number', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Floor</Label>
                      <Input
                        placeholder="1"
                        type="number"
                        value={unit.floor}
                        onChange={(e) => handleUnitChange(index, 'floor', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Bedrooms</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="2"
                        value={unit.bedrooms}
                        onChange={(e) => handleUnitChange(index, 'bedrooms', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Bathrooms</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="1"
                        value={unit.bathrooms}
                        onChange={(e) => handleUnitChange(index, 'bathrooms', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Size (sq ft)</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="850"
                        value={unit.size_sqft}
                        onChange={(e) => handleUnitChange(index, 'size_sqft', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={unit.status}
                      onValueChange={(value: UnitFormState['status']) =>
                        handleUnitChange(index, 'status', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={addUnit}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add another unit
              </Button>
            </CardContent>
          </Card>

      <div className="flex items-center gap-3 pb-10">
        <Button
          type="submit"
          className="flex-1 bg-[#4682B4] hover:bg-[#4682B4]/90"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Property'
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => router.push('/dashboard/manager/properties')}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>

      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader>
            <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <DialogTitle className="text-2xl">Property Added Successfully</DialogTitle>
            <DialogDescription className="text-base text-gray-600">
              Your apartment building was saved. Click below to return to the properties page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-center">
            <Button
              onClick={() => {
                setShowSuccessModal(false)
                router.replace('/dashboard/properties')
                router.refresh()
              }}
              className="bg-[#4682B4] hover:bg-[#375f84]"
            >
              View Properties
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
