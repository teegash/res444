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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { signUp } from '@/lib/auth/actions'
import { useAuth } from '@/lib/auth/context'

type UserType = 'owner' | 'manager' | 'caretaker' | 'tenant'

const USER_TYPES = [
  { id: 'owner', label: 'Property Owner', icon: '🏠' },
  { id: 'manager', label: 'Manager', icon: '👔' },
  { id: 'caretaker', label: 'Caretaker', icon: '🔑' },
  { id: 'tenant', label: 'Tenant', icon: '👤' },
] as const

export default function SignupPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '+254',
    password: '',
    confirmPassword: '',
    userType: 'owner' as UserType,
    organizationId: '',
    buildingId: '',
    termsAccepted: false,
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [passwordStrength, setPasswordStrength] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string }>>([])
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([])
  const [loadingOrgs, setLoadingOrgs] = useState(false)

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
      setFormData(prev => ({ ...prev, organizationId: '', buildingId: '' }))
    }
  }, [formData.userType])

  // Fetch buildings when organization is selected for caretaker
  useEffect(() => {
    if (formData.userType === 'caretaker' && formData.organizationId) {
      fetchBuildings(formData.organizationId)
    } else {
      setBuildings([])
      setFormData(prev => ({ ...prev, buildingId: '' }))
    }
  }, [formData.organizationId, formData.userType])

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

  const handleUserTypeChange = (type: UserType) => {
    setFormData((prev) => ({
      ...prev,
      userType: type,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
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
    if ((formData.userType === 'manager' || formData.userType === 'caretaker') && !formData.organizationId) {
      newErrors.organizationId = 'Please select an organization'
    }
    
    // Require building for caretakers
    if (formData.userType === 'caretaker' && !formData.buildingId) {
      newErrors.buildingId = 'Please select an apartment building'
    }
    
    if (!formData.termsAccepted)
      newErrors.terms = 'You must accept the terms and conditions'

    setErrors(newErrors)

    if (Object.keys(newErrors).length === 0) {
      setIsLoading(true)
      setError(null)
      setSuccess(null)

      try {
        // Map userType to role (owner -> admin, others stay the same)
        const role = formData.userType === 'owner' ? 'admin' : formData.userType

        // Validate role is one of the allowed values
        const validRoles = ['admin', 'manager', 'caretaker', 'tenant']
        if (!validRoles.includes(role)) {
          setError('Invalid user type selected')
          setIsLoading(false)
          return
        }

        // Log the role being sent for debugging
        console.log('Registering user with role:', role, 'from userType:', formData.userType)

        // Call the registration API endpoint
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            full_name: formData.fullName,
            phone: formData.phone,
            role: role,
            organization_id: formData.organizationId || undefined,
            building_id: formData.buildingId || undefined, // For caretakers
          }),
        })

        const result = await response.json()

        if (result.success) {
          // Get role from response or fallback to form data
          const registeredRole = result.data?.role || (formData.userType === 'owner' ? 'admin' : formData.userType)
          const roleDisplay = registeredRole === 'admin' ? 'Admin' : registeredRole.charAt(0).toUpperCase() + registeredRole.slice(1)
          
          // Log the registered role for debugging
          console.log('User registered with role:', registeredRole, 'Role confirmed in response:', result.data?.role)
          
          // If user was created successfully, show success message and redirect
          if (result.data?.user_id) {
            // Check if email verification is required
            if (result.data?.verification_email_sent) {
              if (formData.userType === 'owner') {
                setSuccess(`Property Owner account created successfully! Please check your email to verify your account. After verification, you can create your organization.`)
              } else if (formData.userType === 'manager') {
                setSuccess(`Manager account created successfully! Please check your email to verify your account. After verification, you can access your dashboard.`)
              } else if (formData.userType === 'caretaker') {
                setSuccess(`Caretaker account created successfully! Please check your email to verify your account. After verification, you can access your dashboard.`)
              } else {
                setSuccess(`Account created successfully! Please check your email to verify your account.`)
              }
              setIsLoading(false)
            } else if (formData.userType === 'owner') {
              // Property owner - redirect to setup to create organization
              setSuccess(`Property Owner account created successfully! Redirecting to organization setup...`)
              setIsLoading(false)
              setTimeout(() => {
                router.push('/dashboard/setup')
              }, 2000)
            } else if (formData.userType === 'manager') {
              // Manager - show success and redirect to dashboard
              setSuccess(`Manager account created successfully! You have been added to the organization. Redirecting to dashboard...`)
              setIsLoading(false)
              setTimeout(() => {
                router.push('/dashboard')
              }, 2000)
            } else if (formData.userType === 'caretaker') {
              // Caretaker - show success and redirect to dashboard
              setSuccess(`Caretaker account created successfully! You have been assigned to the apartment building. Redirecting to dashboard...`)
              setIsLoading(false)
              setTimeout(() => {
                router.push('/dashboard')
              }, 2000)
            } else {
              // For tenants, they need to be invited to an organization
              setSuccess(`Account created successfully! Please wait for an invitation from your organization.`)
              setIsLoading(false)
            }
          } else {
            setIsLoading(false)
          }
        } else {
          setError(result.error || 'Failed to create account')
          setIsLoading(false)
        }
      } catch (err) {
        setError('An unexpected error occurred')
        setIsLoading(false)
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
      <Card className="w-full max-w-md p-8 border border-border">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Create Your RentalKenya Account
          </h1>
          <p className="text-sm text-muted-foreground">Step 1 of 2</p>
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

        <form onSubmit={handleSubmit} className="space-y-5">
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
                {formData.userType === 'owner' ? 'Admin' : formData.userType === 'manager' ? 'Manager' : formData.userType === 'caretaker' ? 'Caretaker' : 'Tenant'}
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
                value={formData.organizationId}
                onValueChange={(value) => {
                  setFormData(prev => ({ ...prev, organizationId: value, buildingId: '' }))
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
              {organizations.length === 0 && !loadingOrgs && (
                <p className="text-xs text-muted-foreground">
                  No organizations found. Property owners must create an organization first.
                </p>
              )}
            </div>
          )}

          {/* Building Selection - Required for Caretaker */}
          {formData.userType === 'caretaker' && formData.organizationId && (
            <div className="space-y-2">
              <Label htmlFor="buildingId" className="text-sm font-medium">
                Apartment Building <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.buildingId}
                onValueChange={(value) => {
                  setFormData(prev => ({ ...prev, buildingId: value }))
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
              {buildings.length === 0 && formData.organizationId && (
                <p className="text-xs text-muted-foreground">
                  No buildings found for this organization. Please contact the property owner.
                </p>
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
                Creating Account...
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
      </Card>
    </main>
  )
}

