'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'

type UserType = 'owner' | 'manager' | 'caretaker' | 'tenant'

const USER_TYPES = [
  { id: 'owner', label: 'Property Owner', icon: '🏠' },
  { id: 'manager', label: 'Manager', icon: '👔' },
  { id: 'caretaker', label: 'Caretaker', icon: '🔑' },
  { id: 'tenant', label: 'Tenant', icon: '👤' },
] as const

export function SignupForm() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '+254',
    password: '',
    confirmPassword: '',
    userType: 'owner' as UserType,
    termsAccepted: false,
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [passwordStrength, setPasswordStrength] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

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

    setFormData(prev => ({
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
  }

  const handleUserTypeChange = (type: UserType) => {
    setFormData(prev => ({
      ...prev,
      userType: type,
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validate all fields
    const newErrors: Record<string, string> = {}

    if (!formData.fullName) newErrors.fullName = 'Full name is required'
    if (!formData.email || !validateEmail(formData.email)) newErrors.email = 'Valid email is required'
    if (!formData.phone || !validatePhone(formData.phone)) newErrors.phone = 'Valid phone is required'
    if (!formData.password || formData.password.length < 8) newErrors.password = 'Password must be at least 8 characters'
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match'
    if (!formData.termsAccepted) newErrors.terms = 'You must accept the terms and conditions'

    setErrors(newErrors)

    if (Object.keys(newErrors).length === 0) {
      setIsLoading(true)
      setTimeout(() => {
        console.log('Form submitted:', formData)
        router.push('/dashboard')
      }, 500)
    }
  }

  const getPasswordStrengthColor = () => {
    if (passwordStrength === 0) return 'bg-muted'
    if (passwordStrength === 1) return 'bg-destructive'
    if (passwordStrength === 2) return 'bg-amber-500'
    if (passwordStrength === 3) return 'bg-blue-500'
    return 'bg-accent'
  }

  return (
    <Card className="w-full max-w-md p-8 border border-border">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Create Your RentalKenya Account</h1>
        <p className="text-sm text-muted-foreground">Step 1 of 2</p>
      </div>

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
            className={errors.fullName ? 'border-destructive' : ''}
          />
          {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
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
            className={errors.email ? 'border-destructive' : ''}
          />
          {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
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
            className={errors.phone ? 'border-destructive' : ''}
          />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
        </div>

        {/* Password */}
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium">
            Password
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="••••••••"
            value={formData.password}
            onChange={handleChange}
            className={errors.password ? 'border-destructive' : ''}
          />
          {formData.password && (
            <div className="flex gap-1 mt-2">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full ${
                    i < passwordStrength ? getPasswordStrengthColor() : 'bg-muted'
                  }`}
                />
              ))}
            </div>
          )}
          {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
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
            className={errors.confirmPassword ? 'border-destructive' : ''}
          />
          {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
        </div>

        {/* User Type Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">User Type</Label>
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
                  className="w-4 h-4 cursor-pointer accent-primary"
                />
                <Label htmlFor={id} className="font-normal cursor-pointer">
                  {label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* Terms & Conditions */}
        <div className="flex items-center gap-3 pt-2">
          <Checkbox
            id="terms"
            name="termsAccepted"
            checked={formData.termsAccepted}
            onCheckedChange={(checked) => {
              setFormData(prev => ({
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
        {errors.terms && <p className="text-xs text-destructive">{errors.terms}</p>}

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={isLoading}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2 rounded-lg"
        >
          {isLoading ? 'Creating Account...' : 'Create Account'}
        </Button>

        {/* Sign In Link */}
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </form>
    </Card>
  )
}
