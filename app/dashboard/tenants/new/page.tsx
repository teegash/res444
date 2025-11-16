'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, ArrowLeft } from 'lucide-react'

interface TenantForm {
  fullName: string
  email: string
  phone: string
  nationalId: string
  profilePictureUrl: string
  address: string
  dateOfBirth: string
}

const defaultForm: TenantForm = {
  fullName: '',
  email: '',
  phone: '',
  nationalId: '',
  profilePictureUrl: '',
  address: '',
  dateOfBirth: '',
}

const PROPERTY_NONE_VALUE = 'none'
const UNIT_NONE_VALUE = 'none'

interface PropertyOption {
  id: string
  name: string
}

interface UnitOption {
  id: string
  label: string
  status: string
}

export default function NewTenantPage() {
  const router = useRouter()
  const [form, setForm] = useState<TenantForm>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [properties, setProperties] = useState<PropertyOption[]>([])
  const [propertiesLoading, setPropertiesLoading] = useState(true)
  const [units, setUnits] = useState<UnitOption[]>([])
  const [unitsLoading, setUnitsLoading] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState('')
  const [selectedUnit, setSelectedUnit] = useState('')

  const handleChange = (field: keyof TenantForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError(null)
    setSuccess(null)
  }

  const canSave =
    form.fullName.trim() &&
    form.email.trim() &&
    form.nationalId.trim() &&
    form.phone.trim()

  useEffect(() => {
    let active = true
    const fetchProperties = async () => {
      try {
        setPropertiesLoading(true)
        const response = await fetch('/api/properties', { cache: 'no-store', credentials: 'include' })
        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to fetch properties.')
        }
        if (active) {
          setProperties(
            (result.data || []).map((property: any) => ({
              id: property.id,
              name: property.name,
            }))
          )
        }
      } catch (err) {
        console.error('[NewTenantPage] Failed to load properties', err)
        if (active) {
          setProperties([])
        }
      } finally {
        if (active) {
          setPropertiesLoading(false)
        }
      }
    }
    fetchProperties()
    return () => {
      active = false
    }
  }, [])

  const fetchUnits = useMemo(
    () => async (propertyId: string) => {
      if (!propertyId) {
        setUnits([])
        return
      }
      try {
        setUnitsLoading(true)
        const response = await fetch(
          `/api/properties/${propertyId}/units?buildingId=${encodeURIComponent(propertyId)}`,
          { cache: 'no-store', credentials: 'include' }
        )
        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to load units.')
        }
        const allUnits = Array.isArray(result.data?.units) ? result.data.units : []
        setUnits(
          allUnits.map((unit: any) => ({
            id: unit.id,
            label: `${unit.unit_number || 'Unit'} • ${unit.status || 'unknown'}`,
            status: unit.status || 'unknown',
          }))
        )
      } catch (err) {
        console.error('[NewTenantPage] Failed to load units', err)
        setUnits([])
      } finally {
        setUnitsLoading(false)
      }
    },
    []
  )

  const handlePropertySelect = async (propertyId: string) => {
    setSelectedProperty(propertyId)
    setSelectedUnit('')
    await fetchUnits(propertyId)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSave) {
      setError('Please fill in all required fields.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/tenants/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.fullName,
          email: form.email,
          phone_number: form.phone,
          national_id: form.nationalId,
          profile_picture_url: form.profilePictureUrl,
          address: form.address,
          date_of_birth: form.dateOfBirth,
          unit_id: selectedUnit || null,
        }),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create tenant.')
      }

      setSuccess('Tenant invite sent successfully.')
      setForm(defaultForm)
      setSelectedProperty('')
      setSelectedUnit('')
      setUnits([])
    } catch (err) {
      console.error('[NewTenantPage] Failed to create tenant', err)
      setError(err instanceof Error ? err.message : 'Unexpected error occurred.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/tenants')}>
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <p className="text-xs text-muted-foreground">Tenants</p>
                  <h1 className="text-2xl font-bold text-gray-900">Add New Tenant</h1>
                  <p className="text-sm text-muted-foreground">
                    Capture tenant information exactly as stored in user_profiles.
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Identity & Contact</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="fullName">Full name *</Label>
                      <Input
                        id="fullName"
                        value={form.fullName}
                        onChange={(e) => handleChange('fullName', e.target.value)}
                        placeholder="Jane Tenant"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={form.email}
                        onChange={(e) => handleChange('email', e.target.value)}
                        placeholder="tenant@example.com"
                        required
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="phone">Phone number *</Label>
                      <Input
                        id="phone"
                        value={form.phone}
                        onChange={(e) => handleChange('phone', e.target.value)}
                        placeholder="+254712345678"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="nationalId">National ID *</Label>
                      <Input
                        id="nationalId"
                        value={form.nationalId}
                        onChange={(e) => handleChange('nationalId', e.target.value)}
                        placeholder="12345678"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="profilePicture">Profile picture URL</Label>
                    <Input
                      id="profilePicture"
                      value={form.profilePictureUrl}
                      onChange={(e) => handleChange('profilePictureUrl', e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Background Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="address">Address</Label>
                    <Textarea
                      id="address"
                      value={form.address}
                      onChange={(e) => handleChange('address', e.target.value)}
                      placeholder="Street, estate, city"
                      rows={3}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="dob">Date of birth</Label>
                      <Input
                        id="dob"
                        type="date"
                        value={form.dateOfBirth}
                        onChange={(e) => handleChange('dateOfBirth', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Assign to Property (optional)</Label>
                      <Select
                        value={selectedProperty || PROPERTY_NONE_VALUE}
                        onValueChange={(value) => handlePropertySelect(value === PROPERTY_NONE_VALUE ? '' : value)}
                        disabled={propertiesLoading}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder={propertiesLoading ? 'Loading...' : 'Select property'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={PROPERTY_NONE_VALUE}>Do not assign</SelectItem>
                          {properties.map((property) => (
                            <SelectItem key={property.id} value={property.id}>
                              {property.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Assign to Unit (optional)</Label>
                      <Select
                        value={selectedUnit || UNIT_NONE_VALUE}
                        onValueChange={(value) => setSelectedUnit(value === UNIT_NONE_VALUE ? '' : value)}
                        disabled={!selectedProperty || unitsLoading || units.length === 0}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue
                            placeholder={
                              !selectedProperty
                                ? 'Select property first'
                                : unitsLoading
                                ? 'Loading units...'
                                : units.length
                                ? 'Select unit'
                                : 'No units available'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNIT_NONE_VALUE}>Do not assign</SelectItem>
                          {units
                            .sort((a, b) => {
                              const av = a.status.toLowerCase() === 'vacant' ? 0 : 1
                              const bv = b.status.toLowerCase() === 'vacant' ? 0 : 1
                              return av - bv
                            })
                            .map((unit) => (
                              <SelectItem key={unit.id} value={unit.id}>
                                {unit.label}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/dashboard/tenants')}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-[#4682B4] hover:bg-[#3b6a91] gap-2"
                  disabled={!canSave || saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Creating…
                    </>
                  ) : (
                    'Create Tenant Account'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  )
}
