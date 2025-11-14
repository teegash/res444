'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Progress } from '@/components/ui/progress'
import { CheckCircle2 } from 'lucide-react'

interface SetupFormData {
  // Step 1
  companyName: string
  registrationNumber: string
  email: string
  phone: string
  description: string
  // Step 2
  county: string
  address: string
  postalCode: string
  // Step 3
  contactPerson: string
  bankAccount: string
  paymentMethods: string[]
  timezone: string
  currency: string
  // Step 4
  confirmed: boolean
}

const kenyanCounties = [
  'Nairobi',
  'Mombasa',
  'Kisumu',
  'Nakuru',
  'Eldoret',
  'Machakos',
  'Kakamega',
  'Kericho',
  'Kisii',
  'Nyeri',
]

export function OrganizationSetupWizard() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<SetupFormData>({
    companyName: '',
    registrationNumber: '',
    email: '',
    phone: '',
    description: '',
    county: '',
    address: '',
    postalCode: '',
    contactPerson: '',
    bankAccount: '',
    paymentMethods: [],
    timezone: 'UTC+3',
    currency: 'KES',
    confirmed: false,
  })

  const handleInputChange = (field: keyof SetupFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const togglePaymentMethod = (method: string) => {
    setFormData((prev) => ({
      ...prev,
      paymentMethods: prev.paymentMethods.includes(method)
        ? prev.paymentMethods.filter((m) => m !== method)
        : [...prev.paymentMethods, method],
    }))
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    
    try {
      const response = await fetch('/api/organizations/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.companyName,
          email: formData.email,
          phone: formData.phone,
          registration_number: formData.registrationNumber,
          location: formData.address,
          description: formData.description,
          county: formData.county,
          address: formData.address,
          postal_code: formData.postalCode,
          contact_person: formData.contactPerson,
          bank_account: formData.bankAccount,
          payment_methods: formData.paymentMethods,
          timezone: formData.timezone,
          currency: formData.currency,
        }),
      })

      const result = await response.json()

      if (result.success) {
        // Redirect to dashboard after successful organization creation
        router.push('/dashboard')
      } else {
        // Handle error - you might want to show an error message
        console.error('Failed to create organization:', result.error)
        alert(result.error || 'Failed to create organization. Please try again.')
        setIsSubmitting(false)
      }
    } catch (error) {
      console.error('Error creating organization:', error)
      alert('An unexpected error occurred. Please try again.')
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    router.push('/')
  }

  const progressValue = ((currentStep - 1) / 3) * 100

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-semibold">
            Step {currentStep} of 4
          </span>
          <span className="text-muted-foreground">{Math.round(progressValue)}%</span>
        </div>
        <Progress value={progressValue} />
      </div>

      {/* Step 1: Company Information */}
      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Company Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="company-name">Company Name *</Label>
              <Input
                id="company-name"
                placeholder="Your Company Name"
                value={formData.companyName}
                onChange={(e) => handleInputChange('companyName', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="registration-number">Registration Number *</Label>
              <Input
                id="registration-number"
                placeholder="12345678"
                value={formData.registrationNumber}
                onChange={(e) => handleInputChange('registrationNumber', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                placeholder="company@example.com"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="phone">Phone Number *</Label>
              <Input
                id="phone"
                placeholder="+254712345678"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Tell us about your business... (500 chars max)"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                maxLength={500}
                className="h-24"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {formData.description.length}/500 characters
              </p>
            </div>

            <div className="flex justify-between gap-2 pt-4 border-t">
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={() => setCurrentStep(2)} className="gap-2">
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Company Address */}
      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Company Address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="county">County *</Label>
              <Select value={formData.county} onValueChange={(value) => handleInputChange('county', value)}>
                <SelectTrigger id="county">
                  <SelectValue placeholder="Select county..." />
                </SelectTrigger>
                <SelectContent>
                  {kenyanCounties.map((county) => (
                    <SelectItem key={county} value={county}>
                      {county}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="address">Physical Address *</Label>
              <Textarea
                id="address"
                placeholder="Full physical address..."
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="postal-code">Postal Code</Label>
              <Input
                id="postal-code"
                placeholder="00100"
                value={formData.postalCode}
                onChange={(e) => handleInputChange('postalCode', e.target.value)}
              />
            </div>

            <div className="flex justify-between gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setCurrentStep(1)}>
                Previous
              </Button>
              <Button onClick={() => setCurrentStep(3)} className="gap-2">
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Company Details */}
      {currentStep === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Company Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="contact-person">Primary Contact Person *</Label>
              <Input
                id="contact-person"
                placeholder="John Doe"
                value={formData.contactPerson}
                onChange={(e) => handleInputChange('contactPerson', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="bank-account">Bank Account</Label>
              <Input
                id="bank-account"
                placeholder="Account number"
                value={formData.bankAccount}
                onChange={(e) => handleInputChange('bankAccount', e.target.value)}
              />
            </div>

            <div>
              <Label>Payment Method Preferences *</Label>
              <div className="space-y-2 mt-3">
                {['M-Pesa', 'Bank Transfer', 'Cash'].map((method) => (
                  <div key={method} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id={method}
                      checked={formData.paymentMethods.includes(method)}
                      onChange={() => togglePaymentMethod(method)}
                      className="w-4 h-4 rounded"
                    />
                    <Label htmlFor={method} className="cursor-pointer font-normal">
                      {method}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={formData.timezone}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground mt-1">Fixed to Kenya timezone</p>
            </div>

            <div>
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value={formData.currency}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground mt-1">Fixed to Kenyan Shillings</p>
            </div>

            <div className="flex justify-between gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setCurrentStep(2)}>
                Previous
              </Button>
              <Button onClick={() => setCurrentStep(4)} className="gap-2">
                Review Setup
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Confirmation */}
      {currentStep === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Confirm</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Company Information Summary */}
            <div>
              <h3 className="font-semibold mb-3">Company Information</h3>
              <div className="space-y-2 text-sm bg-muted p-4 rounded-lg">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Company Name:</span>
                  <span>{formData.companyName || 'Not provided'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Registration Number:</span>
                  <span>{formData.registrationNumber || 'Not provided'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span>{formData.email || 'Not provided'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone:</span>
                  <span>{formData.phone || 'Not provided'}</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setCurrentStep(1)} className="mt-2">
                Edit
              </Button>
            </div>

            {/* Address Summary */}
            <div>
              <h3 className="font-semibold mb-3">Address</h3>
              <div className="space-y-2 text-sm bg-muted p-4 rounded-lg">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">County:</span>
                  <span>{formData.county || 'Not provided'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Address:</span>
                  <span>{formData.address || 'Not provided'}</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setCurrentStep(2)} className="mt-2">
                Edit
              </Button>
            </div>

            {/* Details Summary */}
            <div>
              <h3 className="font-semibold mb-3">Details</h3>
              <div className="space-y-2 text-sm bg-muted p-4 rounded-lg">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Contact Person:</span>
                  <span>{formData.contactPerson || 'Not provided'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment Methods:</span>
                  <span>{formData.paymentMethods.join(', ') || 'Not selected'}</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setCurrentStep(3)} className="mt-2">
                Edit
              </Button>
            </div>

            {/* Confirmation Checkbox */}
            <div className="flex items-center gap-3 bg-muted p-4 rounded-lg">
              <input
                type="checkbox"
                id="confirm"
                checked={formData.confirmed}
                onChange={(e) => handleInputChange('confirmed', e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <Label htmlFor="confirm" className="cursor-pointer font-normal">
                I confirm this information is correct
              </Label>
            </div>

            {/* Submit Buttons */}
            <div className="flex justify-between gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setCurrentStep(3)}>
                Previous
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!formData.confirmed || isSubmitting}
                className="gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    Completing Setup...
                  </>
                ) : (
                  'Complete Setup'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success Message */}
      {currentStep === 4 && formData.confirmed && !isSubmitting && (
        <Card className="mt-6 border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-green-900 mb-2">Setup Complete!</h3>
                <p className="text-sm text-green-700">
                  Your organization has been successfully configured. You can now proceed to add
                  properties, tenants, and manage your rental business.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
