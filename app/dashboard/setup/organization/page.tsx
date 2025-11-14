'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function OrganizationSetupPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login')
    }
  }, [user, authLoading, router])


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

    // Validate - only name is required
    const newErrors: Record<string, string> = {}
    if (!formData.name.trim()) {
      newErrors.name = 'Organization name is required'
    }

    setErrors(newErrors)

    if (Object.keys(newErrors).length > 0) {
      setIsLoading(false)
      return
    }

    try {
      // Only send organization name - other fields can be added later
      const response = await fetch('/api/organizations/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: user?.email || '',
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create organization')
      }

      setSuccess('Organization created successfully! Redirecting to dashboard...')
      
      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        router.push('/dashboard')
      }, 2000)
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
            Enter your organization name to get started. You can add more details later.
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
          {/* Organization Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">
              Organization Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              type="text"
              placeholder="Enter your organization name"
              value={formData.name}
              onChange={handleChange}
              disabled={isLoading}
              className={errors.name ? 'border-destructive' : ''}
              autoFocus
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
            <p className="text-xs text-muted-foreground">
              You can add more details like location, registration number, and logo later.
            </p>
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

