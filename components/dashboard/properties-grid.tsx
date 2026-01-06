'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Edit2, Users, Eye, Camera, Loader2, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

const normalizeId = (value: any) => {
  if (typeof value === 'string') {
    return value.trim()
  }
  if (value === null || value === undefined) {
    return ''
  }
  return String(value)
}

interface PropertiesGridProps {
  onEdit: (property: any) => void
  onManageUnits: (property: any) => void
  onView: (id: string) => void
  searchTerm: string
}

export function PropertiesGrid({ onEdit, onManageUnits, onView, searchTerm }: PropertiesGridProps) {
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [propertyImages, setPropertyImages] = useState<Record<string, string>>({})
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const filePickerRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const openUploadModal = (propertyId: string) => {
    const normalizedId = normalizeId(propertyId)
    if (!normalizedId) return

    setActivePropertyId(normalizedId)
    setSelectedFile(null)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
    setUploadError(null)
    setIsUploadOpen(true)
  }

  const closeUploadModal = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setPreviewUrl(null)
    setSelectedFile(null)
    setActivePropertyId(null)
    setUploadError(null)
    setIsUploadOpen(false)
  }

  // Compress image if needed
  const compressImage = (file: File, maxWidth: number = 1200, quality: number = 0.8): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (event) => {
        const img = new Image()
        img.src = event.target?.result as string
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let width = img.width
          let height = img.height

          if (width > maxWidth) {
            height = (height * maxWidth) / width
            width = maxWidth
          }

          canvas.width = width
          canvas.height = height

          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('Failed to get canvas context'))
            return
          }

          ctx.drawImage(img, 0, 0, width, height)

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to compress image'))
                return
              }
              const compressedFile = new File([blob], file.name, {
                type: file.type,
                lastModified: Date.now(),
              })
              resolve(compressedFile)
            },
            file.type,
            quality
          )
        }
        img.onerror = () => reject(new Error('Failed to load image'))
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
    })
  }

  const searchQuery = searchTerm.trim()
  const fetchProperties = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (searchQuery) {
        params.set('q', searchQuery)
      }
      const url = params.toString() ? `/api/properties?${params.toString()}` : '/api/properties'
      const response = await fetch(url, {
        credentials: 'include',
        cache: 'no-store',
      })
      const result = await response.json()
      if (response.ok && result.success) {
        setProperties(result.data || [])
      } else {
        throw new Error(result.error || 'Failed to load properties')
      }
    } catch (error) {
      console.error('Failed to fetch properties:', error)
      setProperties([])
    } finally {
      setLoading(false)
    }
  }, [searchQuery])

  useEffect(() => {
    fetchProperties()
  }, [fetchProperties])

  const uploadImage = async (propertyId: string, file: File) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Invalid file type. Only JPEG, PNG, and WebP images are allowed.')
      throw new Error('Invalid file type')
    }

    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      setUploadError('File size exceeds 5MB limit.')
      throw new Error('File too large')
    }

    setUploading((prev) => ({ ...prev, [propertyId]: true }))

    try {
      let fileToUpload = file
      if (file.size > 500 * 1024) {
        try {
          fileToUpload = await compressImage(file, 1200, 0.8)
        } catch (compressError) {
          console.warn('Image compression failed, using original file:', compressError)
        }
      }

      const supabase = createClient()
      const timestamp = Date.now()
      const fileExtension = fileToUpload.name.split('.').pop()
      const fileName = `properties/${timestamp}-${Math.random().toString(36).substring(7)}.${fileExtension}`

      const bucketName = 'profile-pictures'

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, fileToUpload, {
          contentType: fileToUpload.type,
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) {
        console.error('Storage upload error:', uploadError)
        throw new Error(uploadError.message)
      }

      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName)

      const response = await fetch(
        `/api/properties/${propertyId}/image?buildingId=${encodeURIComponent(propertyId)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ image_url: urlData.publicUrl, building_id: propertyId }),
        }
      )

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update property image.')
      }

      setPropertyImages((prev) => ({ ...prev, [propertyId]: urlData.publicUrl }))
      await fetchProperties()
    } catch (err: any) {
      console.error('Image upload failed:', err)
      throw err
    } finally {
      setUploading((prev) => ({ ...prev, [propertyId]: false }))
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      return
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setUploadError(null)
  }

  const handleUploadSubmit = async () => {
    if (!activePropertyId || !selectedFile) {
      setUploadError('Please select an image first.')
      return
    }

    setUploadError(null)
    try {
      await uploadImage(activePropertyId, selectedFile)
      closeUploadModal()
    } catch (error: any) {
      setUploadError(error?.message || 'Failed to upload image. Please try again.')
    }
  }

  const getImageUrl = (property: any) => {
    const normalizedId = normalizeId(
      property?.id ??
      property?.building_id ??
      property?.buildingId ??
      property?.apartment_building_id
    )
    return propertyImages[normalizedId] || property.imageUrl || '/placeholder.jpg'
  }

  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredProperties = useMemo(() => {
    if (!normalizedSearch) return properties
    return properties.filter((property) => {
      const name = String(property?.name || '').toLowerCase()
      const location = String(property?.location || '').toLowerCase()
      const description = String(property?.description || '').toLowerCase()
      return (
        name.includes(normalizedSearch) ||
        location.includes(normalizedSearch) ||
        description.includes(normalizedSearch)
      )
    })
  }, [properties, normalizedSearch])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {loading && properties.length === 0 ? (
        <div className="col-span-full">
          <SkeletonPropertyCard count={6} />
        </div>
      ) : null}
      {!loading && properties.length > 0 && filteredProperties.length === 0 ? (
        <div className="col-span-full text-center py-10 text-muted-foreground">
          No properties match your search.
        </div>
      ) : null}
      {filteredProperties.map((property) => {
        const buildingId =
          normalizeId(
            property?.id ??
            property?.building_id ??
            property?.buildingId ??
            property?.apartment_building_id
          )
        if (!buildingId) {
          console.warn('[PropertiesGrid] Missing building id in property payload', property)
          return null
        }
        const totalUnits = property.totalUnits ?? property.total ?? 0
        const occupiedUnits = property.occupiedUnits ?? property.occupied ?? 0
        const occupancyPercent = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0

        return (
          <Card
            key={buildingId || property.id}
            className="overflow-hidden hover:shadow-md transition-shadow p-0"
          >
            <div
              className="relative h-28 group cursor-pointer"
              onClick={(e) => {
                // Don't navigate if clicking the edit button
                if ((e.target as HTMLElement).closest('.image-edit-button')) {
                  return
                }
                onView(buildingId)
              }}
            >
              <img
                src={getImageUrl(property)}
                alt={property.name}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              {/* Edit Button Overlay */}
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="icon"
                  variant="secondary"
                  className="image-edit-button h-8 w-8 bg-black/70 hover:bg-black/90 text-white border-0 shadow-lg"
                  onClick={(e) => {
                    e.stopPropagation()
                    openUploadModal(buildingId)
                  }}
                  disabled={uploading[buildingId]}
                  title="Upload property image"
                >
                  {uploading[buildingId] ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
            <CardHeader className="pb-2 pt-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{property.name}</h3>
                  <p className="text-sm text-muted-foreground">{property.location}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 pb-3">
              <Badge className="bg-green-600 text-xs">Active</Badge>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium">Occupancy</span>
                  <span>
                    {occupiedUnits}/{totalUnits} Units
                  </span>
                </div>
                <Progress value={totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0} />
                <p className="text-xs text-muted-foreground mt-1">{occupancyPercent}% occupied</p>
              </div>
              <div className="flex gap-2 pt-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2 text-xs h-8"
                  onClick={() => onEdit({ ...property, id: buildingId })}
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2 text-xs h-8"
                  onClick={() => onManageUnits({ ...property, id: buildingId })}
                >
                  <Users className="w-4 h-4" />
                  Units
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 text-xs h-8"
                onClick={() => onView(buildingId)}
              >
                <Eye className="w-4 h-4" />
                View Details
              </Button>
            </CardContent>
          </Card>
        )
      })}

      <Dialog open={isUploadOpen} onOpenChange={(open) => !open && closeUploadModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Property Image</DialogTitle>
            <DialogDescription>
              Click the area below to select a new image. Supported formats: JPG, PNG, WebP (max 5MB).
            </DialogDescription>
          </DialogHeader>
          <div>
            <input
              ref={filePickerRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
              onChange={handleFileSelect}
              disabled={activePropertyId ? uploading[activePropertyId] : false}
            />
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-[#4682B4] hover:bg-blue-50 transition-colors"
              onClick={() => filePickerRef.current?.click()}
            >
              {previewUrl ? (
                <div className="space-y-3">
                  <img src={previewUrl} alt="Preview" className="mx-auto h-32 w-full object-cover rounded-md" />
                  <p className="text-sm text-gray-600">{selectedFile?.name}</p>
                  <p className="text-xs text-gray-500">Click to change</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="mx-auto h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <Upload className="h-6 w-6 text-blue-600" />
                  </div>
                  <p className="font-medium text-gray-900">Click to upload</p>
                  <p className="text-sm text-gray-500">PNG, JPG, WebP up to 5MB</p>
                </div>
              )}
            </div>
            {uploadError && (
              <p className="mt-3 text-sm text-red-600">
                {uploadError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeUploadModal}
              disabled={activePropertyId ? uploading[activePropertyId] : false}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleUploadSubmit}
              disabled={
                !selectedFile || (activePropertyId ? uploading[activePropertyId] : false)
              }
              className="bg-[#4682B4] hover:bg-[#375f84]"
            >
              {activePropertyId && uploading[activePropertyId] ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                'Upload'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
import { SkeletonPropertyCard } from '@/components/ui/skeletons'
