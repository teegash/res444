'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuth } from '@/lib/auth/context'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  
  // Page 1: User Registration
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '+254',
    password: '',
    confirmPassword: '',
    termsAccepted: false,
  })

  // Page 2: Organization Definition (for owners only)
  const [orgData, setOrgData] = useState({
    name: '',
    location: '',
    registrationNumber: '',
    logoUrl: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [orgErrors, setOrgErrors] = useState<Record<string, string>>({})
  const [passwordStrength, setPasswordStrength] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (!authLoading && user) {
      router.push('/dashboard')
    }
  }, [user, authLoading, router])

  // Real-time validation
  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const validatePhone = (phone: string) => {
    const phoneRegex = /^\+254\d{9}$/
    return phoneRegex.test(phone)
  }

  const calculatePasswordStrength = (password: string) => {
    let strength = 0
    if (password.length >= 8) strength++
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++
    if (/\d/.test(password)) strength++
    if (/[^a-zA-Z\d]/.test(password)) strength++
    return strength
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    const newValue = type === 'checkbox' ? checked : value

    setFormData((prev) => ({
      ...prev,
      [name]: newValue,
    }))

    // Real-time validation
    const newErrors = { ...errors }
    if (name === 'email' && value && !validateEmail(value)) {
      newErrors.email = 'Please enter a valid email'
    } else if (name === 'email') {
      delete newErrors.email
    }

    if (name === 'phone' && value && !validatePhone(value)) {
      newErrors.phone = 'Format: +254XXXXXXXXX'
    } else if (name === 'phone') {
      delete newErrors.phone
    }

    if (name === 'password') {
      const strength = calculatePasswordStrength(value)
      setPasswordStrength(strength)
      if (formData.confirmPassword && value !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match'
      }
    }

    if (name === 'confirmPassword') {
      if (value !== formData.password) {
        newErrors.confirmPassword = 'Passwords do not match'
      } else {
        delete newErrors.confirmPassword
      }
    }

    setErrors(newErrors)
    setError(null)
  }

  const handleOrgChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setOrgData((prev) => ({
      ...prev,
      [name]: value,
    }))

    // Clear errors for this field
    const newErrors = { ...orgErrors }
    delete newErrors[name]
    setOrgErrors(newErrors)
  }

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

          // Calculate new dimensions
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

    // Validate file
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
    
    // Logo upload is optional - if it fails, we'll just continue without logo
    try {
      // Compress image if it's larger than 500KB to speed up upload
      let fileToUpload = file
      if (file.size > 500 * 1024) {
        try {
          fileToUpload = await compressImage(file, 800, 0.8)
        } catch (compressError) {
          console.warn('Image compression failed, using original file:', compressError)
          // Continue with original file if compression fails
        }
      }

      // Upload directly from client to Supabase (bypasses server timeout completely)
      const supabase = createClient()

      // Generate unique file path
      const timestamp = Date.now()
      const fileExtension = fileToUpload.name.split('.').pop()
      const fileName = `organizations/${timestamp}-${Math.random().toString(36).substring(7)}.${fileExtension}`

      // Use profile-pictures bucket (confirmed bucket name)
      const bucketName = 'profile-pictures'
      
      console.log('Uploading to bucket:', bucketName, 'File size:', fileToUpload.size, 'File type:', fileToUpload.type)
      
      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(fileName, fileToUpload, {
          contentType: fileToUpload.type,
          cacheControl: '3600',
          upsert: false,
        })

      if (error) {
        console.warn('Storage upload error (non-blocking):', {
          message: error.message,
          statusCode: error.statusCode,
        })
        // Logo upload failed - just continue without logo (it's optional)
        // Don't show error to user - logo is optional
        return
      }

      // Get public URL
      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName)

      setOrgData((prev) => ({
        ...prev,
        logoUrl: urlData.publicUrl,
      }))
      console.log('Logo uploaded successfully:', urlData.publicUrl)
    } catch (err: any) {
      console.warn('Logo upload failed (non-blocking):', err.message)
      // Logo upload is optional - don't block registration if it fails
      // Just clear the logo URL and continue
      setOrgData((prev) => ({ ...prev, logoUrl: '' }))
      // Don't show error to user - logo is optional
    } finally {
      setIsUploadingLogo(false)
    }
  }

  const handlePage1Submit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validate all fields
    const newErrors: Record<string, string> = {}
    const newOrgErrors: Record<string, string> = {}

    if (!formData.fullName) newErrors.fullName = 'Full name is required'
    if (!formData.email || !validateEmail(formData.email))
      newErrors.email = 'Valid email is required'
    if (!formData.phone || !validatePhone(formData.phone))
      newErrors.phone = 'Valid phone is required'
    if (!formData.password || formData.password.length < 8)
      newErrors.password = 'Password must be at least 8 characters'
    if (formData.password !== formData.confirmPassword)
      newErrors.confirmPassword = 'Passwords do not match'
    if (!orgData.name.trim()) newOrgErrors.name = 'Organization name is required'
    if (!orgData.location.trim()) newOrgErrors.location = 'Location is required'
    if (!orgData.registrationNumber.trim()) newOrgErrors.registrationNumber = 'Registration number is required'
    
    if (!formData.termsAccepted)
      newErrors.terms = 'You must accept the terms and conditions'

    setErrors(newErrors)
    setOrgErrors(newOrgErrors)

    if (Object.keys(newErrors).length === 0 && Object.keys(newOrgErrors).length === 0) {
      handleRegistration()
    }
  }

  const handleRegistration = async () => {
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // Prepare registration payload (includes organization data)
      const registrationPayload: any = {
        email: formData.email,
        password: formData.password,
        full_name: formData.fullName,
        phone: formData.phone,
        role: 'admin',
        organization: {
          name: orgData.name,
          email: formData.email,
          phone: formData.phone,
          location: orgData.location,
          registration_number: orgData.registrationNumber,
          logo_url: orgData.logoUrl || null,
        },
      }

      // Call the registration API endpoint
      console.log('Submitting registration (owner only, organization created during signup):', {
        email: registrationPayload.email,
        role: registrationPayload.role,
        payloadKeys: Object.keys(registrationPayload),
      })

      // Create AbortController for timeout
      // Reduced to 12 seconds - must complete before Vercel timeout (with buffer)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 12000) // 12 second timeout (Vercel limit is 10s, so 12s gives buffer)

      let response: Response
      try {
        response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(registrationPayload),
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        if (fetchError.name === 'AbortError') {
          console.error('Registration request timed out')
          throw new Error('Request timed out. Please check your connection and try again.')
        }
        console.error('Fetch error:', fetchError)
        throw new Error('Network error. Please check your connection and try again.')
      }

      console.log('Registration response status:', response.status, response.statusText)
      console.log('Registration response headers:', Object.fromEntries(response.headers.entries()))

      // Parse response
      let result: any
      try {
        const responseText = await response.text()
        console.log('Registration response text:', responseText)
        
        if (!responseText) {
          throw new Error('Empty response from server')
        }
        
        result = JSON.parse(responseText)
        console.log('Registration result parsed:', result)
      } catch (parseError) {
        console.error('Failed to parse response:', parseError)
        throw new Error('Invalid response from server. Please try again.')
      }

      // Handle response
      if (!response.ok || !result.success) {
        const errorMessage = result.error || `Registration failed with status ${response.status}`
        console.error('Registration failed:', errorMessage, 'Full result:', result)
        throw new Error(errorMessage)
      }

      // Success - always redirect to login with email verification message
      console.log('Registration successful, redirecting to login...')
      
      // Clear loading state before redirect
      setIsLoading(false)
      
      // Small delay to ensure state updates, then redirect
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Redirect to login page with success message
      router.push('/auth/login?tab=manager&registered=true&email=' + encodeURIComponent(formData.email))
    } catch (err) {
      console.error('Registration error:', err)
      setIsLoading(false) // Always clear loading state on error
      
      if (err instanceof Error) {
        setError(err.message || 'Failed to create account. Please try again.')
      } else {
        setError('An unexpected error occurred. Please try again.')
      }
    }
  }

  const getPasswordStrengthColor = () => {
    if (passwordStrength === 0) return 'bg-muted'
    if (passwordStrength === 1) return 'bg-destructive'
    if (passwordStrength === 2) return 'bg-amber-500'
    if (passwordStrength === 3) return 'bg-blue-500'
    return 'bg-accent'
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
            Create Your Account
          </h1>
          <p className="text-sm text-muted-foreground">
            Property owner signup only. We’ll create your organization from this form so you can jump straight into the dashboard.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
            Property Owner · Admin access
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-4 border-green-500 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              {success}
            </AlertDescription>
          </Alert>
        )}

        {/* User Registration Form */}
        <form onSubmit={handlePage1Submit} className="space-y-5">
            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-sm font-medium">
                Full Name
              </Label>
              <Input
                id="fullName"
                name="fullName"
                type="text"
                placeholder="John Doe"
                value={formData.fullName}
                onChange={handleChange}
                disabled={isLoading}
                className={errors.fullName ? 'border-destructive' : ''}
              />
              {errors.fullName && (
                <p className="text-xs text-destructive">{errors.fullName}</p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                disabled={isLoading}
                className={errors.email ? 'border-destructive' : ''}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email}</p>
              )}
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-medium">
                Phone Number
              </Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="+254712345678"
                value={formData.phone}
                onChange={handleChange}
                disabled={isLoading}
                className={errors.phone ? 'border-destructive' : ''}
              />
              {errors.phone && (
                <p className="text-xs text-destructive">{errors.phone}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  disabled={isLoading}
                  className={errors.password ? 'border-destructive' : ''}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {formData.password && (
                <div className="flex gap-1 mt-2">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full ${
                        i < passwordStrength
                          ? getPasswordStrengthColor()
                          : 'bg-muted'
                      }`}
                    />
                  ))}
                </div>
              )}
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={handleChange}
                disabled={isLoading}
                className={errors.confirmPassword ? 'border-destructive' : ''}
              />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">
                {errors.confirmPassword}
              </p>
            )}
          </div>

            {/* Organization Details */}
            <div className="pt-4 space-y-3 border-t">
              <div>
                <h3 className="text-sm font-semibold">Organization Details</h3>
                <p className="text-xs text-muted-foreground">
                  We’ll create a dedicated organization for your properties.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="organizationName" className="text-sm font-medium">
                  Organization Name
                </Label>
                <Input
                  id="organizationName"
                  name="name"
                  type="text"
                  placeholder="Acme Homes Ltd"
                  value={orgData.name}
                  onChange={handleOrgChange}
                  disabled={isLoading}
                  className={orgErrors.name ? 'border-destructive' : ''}
                />
                {orgErrors.name && (
                  <p className="text-xs text-destructive">{orgErrors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="organizationLocation" className="text-sm font-medium">
                  Location
                </Label>
                <Input
                  id="organizationLocation"
                  name="location"
                  type="text"
                  placeholder="Nairobi, Kenya"
                  value={orgData.location}
                  onChange={handleOrgChange}
                  disabled={isLoading}
                  className={orgErrors.location ? 'border-destructive' : ''}
                />
                {orgErrors.location && (
                  <p className="text-xs text-destructive">{orgErrors.location}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="registrationNumber" className="text-sm font-medium">
                  Registration Number
                </Label>
                <Input
                  id="registrationNumber"
                  name="registrationNumber"
                  type="text"
                  placeholder="ABC-12345"
                  value={orgData.registrationNumber}
                  onChange={handleOrgChange}
                  disabled={isLoading}
                  className={orgErrors.registrationNumber ? 'border-destructive' : ''}
                />
                {orgErrors.registrationNumber && (
                  <p className="text-xs text-destructive">{orgErrors.registrationNumber}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="organizationLogo" className="text-sm font-medium">
                  Organization Logo (optional)
                </Label>
                <Input
                  id="organizationLogo"
                  name="organizationLogo"
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={isLoading || isUploadingLogo}
                />
                <p className="text-xs text-muted-foreground">
                  {isUploadingLogo
                    ? 'Uploading logo...'
                    : orgData.logoUrl
                      ? 'Logo uploaded successfully.'
                      : 'Optional. Upload a logo to personalize your organization.'}
                </p>
              </div>
            </div>

            {/* Terms & Conditions */}
            <div className="flex items-center gap-3 pt-2">
              <Checkbox
                id="terms"
                name="termsAccepted"
                checked={formData.termsAccepted}
                disabled={isLoading}
                onCheckedChange={(checked) => {
                  setFormData((prev) => ({
                    ...prev,
                    termsAccepted: checked === true,
                  }))
                  if (checked === true) {
                    setErrors((prev) => {
                      const next = { ...prev }
                      delete next.terms
                      return next
                    })
                  }
                }}
              />
              <Label htmlFor="terms" className="text-sm font-normal cursor-pointer">
                I agree to the Terms & Conditions
              </Label>
            </div>
            {errors.terms && (
              <p className="text-xs text-destructive">{errors.terms}</p>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2 rounded-lg"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </div>
              ) : (
                'Create Account'
              )}
            </Button>

            {/* Sign In Link */}
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link
                href="/auth/login"
                className="text-primary hover:underline font-medium"
              >
                Sign in
              </Link>
            </p>
          </form>

        {/* Page 2 removed - Organization setup happens after email confirmation and first login */}
        {/* Organization setup now happens at /dashboard/setup/organization after first login */}
      </Card>
    </main>
  )
}
