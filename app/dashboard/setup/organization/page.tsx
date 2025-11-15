'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { Loader2, Upload, X, CheckCircle2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createClient } from '@/lib/supabase/client'

export default function OrganizationSetupPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    location: '',
    registrationNumber: '',
    logoUrl: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [userPhone, setUserPhone] = useState<string>('')

  // Load user phone from profile
  useEffect(() => {
    const loadUserPhone = async () => {
      if (!user?.id) return
      
      try {
        const supabase = createClient()
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('phone_number')
          .eq('id', user.id)
          .maybeSingle()

        setUserPhone(profile?.phone_number || user?.user_metadata?.phone || '')
      } catch (error) {
        console.error('Error loading user phone:', error)
        setUserPhone(user?.user_metadata?.phone || '')
      }
    }

    if (user) {
      loadUserPhone()
    }
  }, [user])

  // Redirect if not authenticated or if organization already exists
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login')
      return
    }

    // Check if user already has an organization - if so, redirect to dashboard
    const checkOrganization = async () => {
      if (!user?.id) return

      try {
        const response = await fetch('/api/organizations/current')
        const result = await response.json()

        if (result.success && result.data) {
          // User already has an organization, redirect to dashboard
          window.location.href = '/dashboard'
        }
      } catch (error) {
        // Ignore errors - user might not have organization yet
        console.log('No organization found, allowing setup')
      }
    }

    if (user && !authLoading) {
      checkOrganization()
    }
  }, [user, authLoading, router])

  // Compress image if needed
  const compressImage = (file: File, maxWidth: number = 800, quality: number = 0.8): Promise<File> => {
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

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setError('Invalid file type. Only JPEG, PNG, and WebP images are allowed.')
      return
    }

    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      setError('File size exceeds 5MB limit')
      return
    }

    setIsUploadingLogo(true)
    setError(null)

    try {
      let fileToUpload = file
      if (file.size > 500 * 1024) {
        try {
          fileToUpload = await compressImage(file, 800, 0.8)
        } catch (compressError) {
          console.warn('Image compression failed, using original file:', compressError)
        }
      }

      const supabase = createClient()
      const timestamp = Date.now()
      const fileExtension = fileToUpload.name.split('.').pop()
      const fileName = `organizations/${timestamp}-${Math.random().toString(36).substring(7)}.${fileExtension}`

      const bucketName = 'profile-pictures'
      
      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(fileName, fileToUpload, {
          contentType: fileToUpload.type,
          cacheControl: '3600',
          upsert: false,
        })

      if (error) {
        console.warn('Storage upload error (non-blocking):', error)
        return
      }

      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName)

      setFormData((prev) => ({
        ...prev,
        logoUrl: urlData.publicUrl,
      }))
    } catch (err: any) {
      console.warn('Logo upload failed (non-blocking):', err.message)
      setFormData((prev) => ({ ...prev, logoUrl: '' }))
    } finally {
      setIsUploadingLogo(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))

    // Clear errors for this field
    const newErrors = { ...errors }
    delete newErrors[name]
    setErrors(newErrors)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    // Validate
    const newErrors: Record<string, string> = {}
    if (!formData.name.trim()) newErrors.name = 'Organization name is required'
    if (!formData.location.trim()) newErrors.location = 'Location is required'
    if (!formData.registrationNumber.trim()) newErrors.registrationNumber = 'Registration number is required'

    setErrors(newErrors)

    if (Object.keys(newErrors).length > 0) {
      setIsLoading(false)
      return
    }

    try {
      // Use phone from state (already loaded from profile)
      const response = await fetch('/api/organizations/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: user?.email || '',
          phone: userPhone,
          location: formData.location.trim(),
          registration_number: formData.registrationNumber.trim(),
          logo_url: formData.logoUrl || null,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create organization')
      }

      setSuccess('Organization created successfully! Redirecting to dashboard...')
      
      // Force immediate redirect using window.location for full page reload
      // Add timestamp to bypass any caching issues
      // This ensures the proxy recognizes the new organization membership
      setTimeout(() => {
        window.location.href = '/dashboard?org_created=' + Date.now()
      }, 1000)
    } catch (err) {
      console.error('Organization creation error:', err)
      setIsLoading(false)
      if (err instanceof Error) {
        setError(err.message || 'Failed to create organization. Please try again.')
      } else {
        setError('An unexpected error occurred. Please try again.')
      }
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md md:max-w-2xl lg:max-w-3xl p-6 md:p-8 border border-border">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Set Up Your Organization
          </h1>
          <p className="text-sm text-muted-foreground">
            Complete your organization profile to get started
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-4 border-green-500 bg-green-50 dark:bg-green-950/20">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800 dark:text-green-200">
              {success}
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Organization Name */}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name" className="text-sm font-medium">
                Organization Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                type="text"
                placeholder="Your Organization Name"
                value={formData.name}
                onChange={handleChange}
                disabled={isLoading}
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name}</p>
              )}
            </div>

            {/* Email (read-only, from user account) */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={user?.email || ''}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                This will be used as the organization email
              </p>
            </div>

            {/* Phone (read-only, from user profile) */}
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-medium">
                Phone Number
              </Label>
              <Input
                id="phone"
                type="tel"
                value={userPhone}
                disabled
                className="bg-muted"
                placeholder={userPhone ? '' : 'Loading...'}
              />
              <p className="text-xs text-muted-foreground">
                This will be used as the organization phone (from your profile)
              </p>
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label htmlFor="location" className="text-sm font-medium">
                Location <span className="text-destructive">*</span>
              </Label>
              <Input
                id="location"
                name="location"
                type="text"
                placeholder="Organization location/address"
                value={formData.location}
                onChange={handleChange}
                disabled={isLoading}
                className={errors.location ? 'border-destructive' : ''}
              />
              {errors.location && (
                <p className="text-xs text-destructive">{errors.location}</p>
              )}
            </div>

            {/* Registration Number */}
            <div className="space-y-2">
              <Label htmlFor="registrationNumber" className="text-sm font-medium">
                Registration Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="registrationNumber"
                name="registrationNumber"
                type="text"
                placeholder="Organization registration number"
                value={formData.registrationNumber}
                onChange={handleChange}
                disabled={isLoading}
                className={errors.registrationNumber ? 'border-destructive' : ''}
              />
              {errors.registrationNumber && (
                <p className="text-xs text-destructive">{errors.registrationNumber}</p>
              )}
            </div>
          </div>

          {/* Logo Upload */}
          <div className="space-y-2">
            <Label htmlFor="logo" className="text-sm font-medium">
              Organization Logo (Optional)
            </Label>
            {formData.logoUrl ? (
              <div className="relative inline-block">
                <img
                  src={formData.logoUrl}
                  alt="Organization logo"
                  className="w-32 h-32 md:w-40 md:h-40 object-cover rounded-lg border"
                />
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, logoUrl: '' }))}
                  className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 md:p-8 text-center max-w-md">
                <input
                  type="file"
                  id="logo"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={handleLogoUpload}
                  disabled={isLoading || isUploadingLogo}
                  className="hidden"
                />
                <label
                  htmlFor="logo"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <Upload className="w-8 h-8 md:w-10 md:h-10 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    {isUploadingLogo ? 'Uploading...' : 'Click to upload logo'}
                  </span>
                  <span className="text-xs text-gray-500">
                    PNG, JPG, WebP up to 5MB
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2 rounded-lg"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating Organization...
              </div>
            ) : (
              'Create Organization'
            )}
          </Button>
        </form>
      </Card>
    </main>
  )
}

