'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, CheckCircle2, Upload, X, ArrowLeft, ArrowRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/lib/auth/context'
import { createClient } from '@/lib/supabase/client'

type UserType = 'owner' | 'manager' | 'caretaker'

const USER_TYPES = [
  { id: 'owner', label: 'Property Owner', icon: '🏠' },
  { id: 'manager', label: 'Manager', icon: '👔' },
  { id: 'caretaker', label: 'Caretaker', icon: '🔑' },
] as const

export default function SignupPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [currentPage, setCurrentPage] = useState<1 | 2>(1)
  
  // Page 1: User Registration
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '+254',
    password: '',
    confirmPassword: '',
    userType: 'owner' as UserType,
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
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string }>>([])
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([])
  const [loadingOrgs, setLoadingOrgs] = useState(false)
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('')
  const [selectedBuildingId, setSelectedBuildingId] = useState('')

  useEffect(() => {
    if (!authLoading && user) {
      router.push('/dashboard')
    }
  }, [user, authLoading, router])

  // Fetch organizations when manager or caretaker is selected
  useEffect(() => {
    if (formData.userType === 'manager' || formData.userType === 'caretaker') {
      fetchOrganizations()
    } else {
      setOrganizations([])
      setBuildings([])
      setSelectedOrganizationId('')
      setSelectedBuildingId('')
    }
  }, [formData.userType])

  // Fetch buildings when organization is selected for caretaker
  useEffect(() => {
    if (formData.userType === 'caretaker' && selectedOrganizationId) {
      fetchBuildings(selectedOrganizationId)
    } else {
      setBuildings([])
      setSelectedBuildingId('')
    }
  }, [selectedOrganizationId, formData.userType])

  const fetchOrganizations = async () => {
    setLoadingOrgs(true)
    try {
      const response = await fetch('/api/organizations/list')
      const result = await response.json()
      if (result.success) {
        setOrganizations(result.data || [])
      }
    } catch (error) {
      console.error('Error fetching organizations:', error)
    } finally {
      setLoadingOrgs(false)
    }
  }

  const fetchBuildings = async (organizationId: string) => {
    try {
      const response = await fetch(`/api/buildings/list?organization_id=${organizationId}`)
      const result = await response.json()
      if (result.success) {
        setBuildings(result.data || [])
      }
    } catch (error) {
      console.error('Error fetching buildings:', error)
    }
  }

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

  const handleUserTypeChange = (type: UserType) => {
    setFormData((prev) => ({
      ...prev,
      userType: type,
    }))
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
        console.error('Storage upload error:', {
          message: error.message,
          statusCode: error.statusCode,
          error: error,
        })
        
        // Provide more helpful error message
        if (error.message?.includes('new row violates row-level security')) {
          throw new Error('Storage bucket RLS policy is blocking upload. Please check bucket policies in Supabase Dashboard.')
        } else if (error.message?.includes('Bucket') || error.message?.includes('not found')) {
          throw new Error(`Storage bucket "${bucketName}" not found. Please create it in Supabase Dashboard.`)
        } else {
          throw new Error(error.message || 'Failed to upload logo. Please ensure the storage bucket exists and allows public uploads.')
        }
      }

      // Get public URL
      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName)

      setOrgData((prev) => ({
        ...prev,
        logoUrl: urlData.publicUrl,
      }))
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message || 'Failed to upload logo. Please try again.')
      } else {
        setError('Failed to upload logo. Please try again.')
      }
      console.error('Logo upload error:', err)
    } finally {
      setIsUploadingLogo(false)
    }
  }

  const handlePage1Submit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validate all fields
    const newErrors: Record<string, string> = {}

    if (!formData.fullName) newErrors.fullName = 'Full name is required'
    if (!formData.email || !validateEmail(formData.email))
      newErrors.email = 'Valid email is required'
    if (!formData.phone || !validatePhone(formData.phone))
      newErrors.phone = 'Valid phone is required'
    if (!formData.password || formData.password.length < 8)
      newErrors.password = 'Password must be at least 8 characters'
    if (formData.password !== formData.confirmPassword)
      newErrors.confirmPassword = 'Passwords do not match'
    
    // Require organization for managers and caretakers
    if ((formData.userType === 'manager' || formData.userType === 'caretaker') && !selectedOrganizationId) {
      newErrors.organizationId = 'Please select an organization'
    }
    
    // Require building for caretakers
    if (formData.userType === 'caretaker' && !selectedBuildingId) {
      newErrors.buildingId = 'Please select an apartment building'
    }
    
    if (!formData.termsAccepted)
      newErrors.terms = 'You must accept the terms and conditions'

    setErrors(newErrors)

    if (Object.keys(newErrors).length === 0) {
      // If owner, go to page 2, otherwise register immediately
      if (formData.userType === 'owner') {
        setCurrentPage(2)
      } else {
        handleRegistration()
      }
    }
  }

  const handlePage2Submit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Page 2 form submitted')

    // Validate organization fields
    const newErrors: Record<string, string> = {}

    if (!orgData.name.trim()) newErrors.name = 'Organization name is required'
    if (!orgData.location.trim()) newErrors.location = 'Location is required'
    if (!orgData.registrationNumber.trim()) newErrors.registrationNumber = 'Registration number is required'

    console.log('Validation errors:', newErrors)
    setOrgErrors(newErrors)

    if (Object.keys(newErrors).length === 0) {
      console.log('No validation errors, calling handleRegistration...')
      await handleRegistration()
    } else {
      console.log('Validation failed, not submitting')
    }
  }

  const handleRegistration = async () => {
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // Map userType to role (owner -> admin, others stay the same)
      const role = formData.userType === 'owner' ? 'admin' : formData.userType

      // Prepare registration payload
      const registrationPayload: any = {
        email: formData.email,
        password: formData.password,
        full_name: formData.fullName,
        phone: formData.phone,
        role: role,
        organization_id: formData.userType === 'owner' ? undefined : selectedOrganizationId,
        building_id: formData.userType === 'caretaker' ? selectedBuildingId : undefined,
      }

      // If owner, include organization data
      if (formData.userType === 'owner') {
        registrationPayload.organization = {
          name: orgData.name.trim(),
          email: formData.email, // Same as user email
          phone: formData.phone, // Same as user phone
          location: orgData.location.trim(),
          registration_number: orgData.registrationNumber.trim(),
          logo_url: orgData.logoUrl || null,
        }
      }

      // Call the registration API endpoint
      console.log('Submitting registration:', {
        email: registrationPayload.email,
        role: registrationPayload.role,
        hasOrganization: !!registrationPayload.organization,
      })

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(registrationPayload),
      })

      console.log('Registration response status:', response.status, response.statusText)

      // Parse response
      let result: any
      try {
        const responseText = await response.text()
        console.log('Registration response text:', responseText)
        result = responseText ? JSON.parse(responseText) : {}
      } catch (parseError) {
        console.error('Failed to parse response:', parseError)
        throw new Error('Invalid response from server. Please try again.')
      }

      console.log('Registration result:', result)

      // Handle response
      if (!response.ok || !result.success) {
        const errorMessage = result.error || `Registration failed with status ${response.status}`
        console.error('Registration failed:', errorMessage)
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
            {currentPage === 1 ? 'Create Your Account' : 'Organization Details'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {currentPage === 1 ? 'Step 1 of 2' : 'Step 2 of 2'}
          </p>
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

        {/* Page 1: User Registration */}
        {currentPage === 1 && (
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

            {/* User Type Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">User Type</Label>
                {formData.userType && (
                  <span className="text-xs text-muted-foreground">
                    Selected: <span className="font-semibold text-primary">
                      {formData.userType === 'owner' ? 'Admin' : formData.userType.charAt(0).toUpperCase() + formData.userType.slice(1)}
                    </span>
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {USER_TYPES.map(({ id, label }) => (
                  <div key={id} className="flex items-center gap-3">
                    <input
                      type="radio"
                      id={id}
                      name="userType"
                      value={id}
                      checked={formData.userType === id}
                      onChange={() => handleUserTypeChange(id as UserType)}
                      disabled={isLoading}
                      className="w-4 h-4 cursor-pointer accent-primary"
                    />
                    <Label htmlFor={id} className="font-normal cursor-pointer">
                      {label}
                    </Label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Your role will be: <span className="font-semibold">
                  {formData.userType === 'owner' ? 'Admin' : formData.userType === 'manager' ? 'Manager' : 'Caretaker'}
                </span>
              </p>
            </div>

            {/* Organization Selection - Required for Manager and Caretaker */}
            {(formData.userType === 'manager' || formData.userType === 'caretaker') && (
              <div className="space-y-2">
                <Label htmlFor="organizationId" className="text-sm font-medium">
                  Organization <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={selectedOrganizationId}
                  onValueChange={(value) => {
                    setSelectedOrganizationId(value)
                    setErrors(prev => {
                      const newErrors = { ...prev }
                      delete newErrors.organizationId
                      return newErrors
                    })
                  }}
                  disabled={isLoading || loadingOrgs}
                >
                  <SelectTrigger className={errors.organizationId ? 'border-destructive' : ''}>
                    <SelectValue placeholder={loadingOrgs ? 'Loading organizations...' : 'Select an organization'} />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.length === 0 ? (
                      <SelectItem value="none" disabled>No organizations available</SelectItem>
                    ) : (
                      organizations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {errors.organizationId && (
                  <p className="text-xs text-destructive">{errors.organizationId}</p>
                )}
              </div>
            )}

            {/* Building Selection - Required for Caretaker */}
            {formData.userType === 'caretaker' && selectedOrganizationId && (
              <div className="space-y-2">
                <Label htmlFor="buildingId" className="text-sm font-medium">
                  Apartment Building <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={selectedBuildingId}
                  onValueChange={(value) => {
                    setSelectedBuildingId(value)
                    setErrors(prev => {
                      const newErrors = { ...prev }
                      delete newErrors.buildingId
                      return newErrors
                    })
                  }}
                  disabled={isLoading || buildings.length === 0}
                >
                  <SelectTrigger className={errors.buildingId ? 'border-destructive' : ''}>
                    <SelectValue placeholder={buildings.length === 0 ? 'No buildings available' : 'Select an apartment building'} />
                  </SelectTrigger>
                  <SelectContent>
                    {buildings.length === 0 ? (
                      <SelectItem value="none" disabled>No buildings available for this organization</SelectItem>
                    ) : (
                      buildings.map((building) => (
                        <SelectItem key={building.id} value={building.id}>
                          {building.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {errors.buildingId && (
                  <p className="text-xs text-destructive">{errors.buildingId}</p>
                )}
              </div>
            )}

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
                    delete errors.terms
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
              ) : formData.userType === 'owner' ? (
                <div className="flex items-center gap-2">
                  Next
                  <ArrowRight className="w-4 h-4" />
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
        )}

        {/* Page 2: Organization Definition (Owners only) */}
        {currentPage === 2 && (
          <form onSubmit={handlePage2Submit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Organization Name */}
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="orgName" className="text-sm font-medium">
                  Organization Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="orgName"
                  name="name"
                  type="text"
                  placeholder="Your Organization Name"
                  value={orgData.name}
                  onChange={handleOrgChange}
                  disabled={isLoading}
                  className={orgErrors.name ? 'border-destructive' : ''}
                />
                {orgErrors.name && (
                  <p className="text-xs text-destructive">{orgErrors.name}</p>
                )}
              </div>

              {/* Email (read-only, from page 1) */}
              <div className="space-y-2">
                <Label htmlFor="orgEmail" className="text-sm font-medium">
                  Email
                </Label>
                <Input
                  id="orgEmail"
                  type="email"
                  value={formData.email}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  This will be used as the organization email
                </p>
              </div>

              {/* Phone (read-only, from page 1) */}
              <div className="space-y-2">
                <Label htmlFor="orgPhone" className="text-sm font-medium">
                  Phone Number
                </Label>
                <Input
                  id="orgPhone"
                  type="tel"
                  value={formData.phone}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  This will be used as the organization phone
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
                  value={orgData.location}
                  onChange={handleOrgChange}
                  disabled={isLoading}
                  className={orgErrors.location ? 'border-destructive' : ''}
                />
                {orgErrors.location && (
                  <p className="text-xs text-destructive">{orgErrors.location}</p>
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
                  value={orgData.registrationNumber}
                  onChange={handleOrgChange}
                  disabled={isLoading}
                  className={orgErrors.registrationNumber ? 'border-destructive' : ''}
                />
                {orgErrors.registrationNumber && (
                  <p className="text-xs text-destructive">{orgErrors.registrationNumber}</p>
                )}
              </div>
            </div>

            {/* Logo Upload */}
            <div className="space-y-2">
              <Label htmlFor="logo" className="text-sm font-medium">
                Organization Logo (Optional)
              </Label>
              {orgData.logoUrl ? (
                <div className="relative inline-block">
                  <img
                    src={orgData.logoUrl}
                    alt="Organization logo"
                    className="w-32 h-32 md:w-40 md:h-40 object-cover rounded-lg border"
                  />
                  <button
                    type="button"
                    onClick={() => setOrgData(prev => ({ ...prev, logoUrl: '' }))}
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

            {/* Navigation Buttons */}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentPage(1)}
                disabled={isLoading}
                className="flex-1"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button
                type="submit"
                disabled={isLoading || isUploadingLogo}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating Account...
                  </div>
                ) : isUploadingLogo ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading Logo...
                  </div>
                ) : (
                  'Create Account'
                )}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </main>
  )
}
