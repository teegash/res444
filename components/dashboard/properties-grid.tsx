'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Edit2, Users, Eye, Camera, Loader2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const properties = [
  {
    id: 1,
    name: 'Alpha Complex',
    location: 'Nairobi',
    occupied: 12,
    total: 15,
    image: '/modern-residential-building.png',
  },
  {
    id: 2,
    name: 'Beta Towers',
    location: 'Westlands',
    occupied: 8,
    total: 10,
    image: '/modern-apartment-complex.png',
  },
  {
    id: 3,
    name: 'Gamma Heights',
    location: 'Karen',
    occupied: 18,
    total: 20,
    image: '/modern-building.png',
  },
]

interface PropertiesGridProps {
  onEdit: (property: any) => void
  onManageUnits: (property: any) => void
  onView: (id: number) => void
}

export function PropertiesGrid({ onEdit, onManageUnits, onView }: PropertiesGridProps) {
  const [uploading, setUploading] = useState<{ [key: number]: boolean }>({})
  const [propertyImages, setPropertyImages] = useState<{ [key: number]: string }>({})
  const fileInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({})

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

  const handleImageUpload = async (propertyId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file type. Only JPEG, PNG, and WebP images are allowed.')
      return
    }

    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      alert('File size exceeds 5MB limit')
      return
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

      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(fileName, fileToUpload, {
          contentType: fileToUpload.type,
          cacheControl: '3600',
          upsert: false,
        })

      if (error) {
        console.error('Storage upload error:', error)
        alert('Failed to upload image. Please try again.')
        return
      }

      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName)

      // Update the property image in state
      setPropertyImages((prev) => ({ ...prev, [propertyId]: urlData.publicUrl }))

      // TODO: Update the property image URL in the database via API
      // This would typically involve calling an API endpoint to update the property record
      console.log('Image uploaded successfully:', urlData.publicUrl)
    } catch (err: any) {
      console.error('Image upload failed:', err)
      alert('Failed to upload image. Please try again.')
    } finally {
      setUploading((prev) => ({ ...prev, [propertyId]: false }))
      // Reset file input
      if (fileInputRefs.current[propertyId]) {
        fileInputRefs.current[propertyId]!.value = ''
      }
    }
  }

  const getImageUrl = (property: typeof properties[0]) => {
    return propertyImages[property.id] || property.image
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {properties.map((property) => (
        <Card key={property.id} className="overflow-hidden hover:shadow-lg transition-shadow">
          <div
            className="h-40 bg-muted relative group cursor-pointer"
            style={{
              backgroundImage: `url('${getImageUrl(property)}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
            onClick={(e) => {
              // Don't navigate if clicking the edit button
              if ((e.target as HTMLElement).closest('.image-edit-button')) {
                return
              }
              onView(property.id)
            }}
          >
            {/* Edit Button Overlay */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <input
                ref={(el) => (fileInputRefs.current[property.id] = el)}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
                onChange={(e) => handleImageUpload(property.id, e)}
                disabled={uploading[property.id]}
              />
              <Button
                size="icon"
                variant="secondary"
                className="image-edit-button h-8 w-8 bg-black/70 hover:bg-black/90 text-white border-0 shadow-lg"
                onClick={(e) => {
                  e.stopPropagation()
                  fileInputRefs.current[property.id]?.click()
                }}
                disabled={uploading[property.id]}
                title="Upload property image"
              >
                {uploading[property.id] ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-lg">{property.name}</h3>
                <p className="text-sm text-muted-foreground">{property.location}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Badge className="bg-green-600">Active</Badge>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="font-medium">Occupancy</span>
                <span>{property.occupied}/{property.total} Units</span>
              </div>
              <Progress value={(property.occupied / property.total) * 100} />
              <p className="text-xs text-muted-foreground mt-1">
                {Math.round((property.occupied / property.total) * 100)}% occupied
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                onClick={() => onEdit(property)}
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                onClick={() => onManageUnits(property)}
              >
                <Users className="w-4 h-4" />
                Units
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-2"
              onClick={() => onView(property.id)}
            >
              <Eye className="w-4 h-4" />
              View Details
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
