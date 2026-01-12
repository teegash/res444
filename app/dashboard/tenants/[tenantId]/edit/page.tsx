'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ChronoSelect } from '@/components/ui/chrono-select'
import { SuccessModal } from '@/components/ui/success-modal'
import { Loader2, ArrowLeft, Camera } from 'lucide-react'

interface TenantForm {
  fullName: string
  email: string
  phone: string
  nationalId: string
  address: string
  dateOfBirth: string
}

interface LeaseSummary {
  id: string
  start_date: string | null
  end_date: string | null
  status: string | null
  monthly_rent: number | null
  deposit_amount: number | null
  unit: {
    id: string
    unit_number: string | null
    status: string | null
    building?: {
      id: string
      name: string | null
      location: string | null
    } | null
  } | null
}

const defaultForm: TenantForm = {
  fullName: '',
  email: '',
  phone: '',
  nationalId: '',
  address: '',
  dateOfBirth: '',
}

export default function EditTenantPage() {
  const router = useRouter()
  const params = useParams()
  const tenantId = String((params as any)?.tenantId || '')

  const [form, setForm] = useState<TenantForm>(defaultForm)
  const [lease, setLease] = useState<LeaseSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [profileFile, setProfileFile] = useState<File | null>(null)
  const [profilePreview, setProfilePreview] = useState<string | null>(null)
  const [tempPreview, setTempPreview] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const toDateString = (date?: Date) => {
    if (!date) return ''
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const fromDateString = (value: string) => {
    if (!value) return undefined
    const [year, month, day] = value.split('-').map(Number)
    if (!year || !month || !day) return undefined
    return new Date(year, month - 1, day)
  }

  const handleChange = (field: keyof TenantForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError(null)
    setSuccess(null)
  }

  const canSave = form.fullName.trim() && form.phone.trim() && form.nationalId.trim()

  useEffect(() => {
    return () => {
      if (tempPreview && profilePreview) {
        URL.revokeObjectURL(profilePreview)
      }
    }
  }, [profilePreview, tempPreview])

  useEffect(() => {
    let active = true

    const loadTenant = async () => {
      if (!tenantId) return
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}`, {
          cache: 'no-store',
          credentials: 'include',
        })
        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to load tenant details.')
        }

        if (!active) return

        const profile = result.data?.profile || {}
        const email = result.data?.email || ''
        const leaseInfo = result.data?.lease || null

        setForm({
          fullName: profile.full_name || '',
          email: email || '',
          phone: profile.phone_number || '',
          nationalId: profile.national_id || '',
          address: profile.address || '',
          dateOfBirth: profile.date_of_birth ? String(profile.date_of_birth) : '',
        })

        setLease(leaseInfo)

        if (profile.profile_picture_url) {
          setProfilePreview(profile.profile_picture_url)
          setTempPreview(false)
        } else {
          setProfilePreview(null)
          setTempPreview(false)
        }
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load tenant details.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadTenant()

    return () => {
      active = false
    }
  }, [tenantId])

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (PNG, JPG, or WebP).')
      return
    }

    if (tempPreview && profilePreview) {
      URL.revokeObjectURL(profilePreview)
    }

    setProfileFile(file)
    setProfilePreview(URL.createObjectURL(file))
    setTempPreview(true)
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
      let profilePictureBase64: string | null = null
      if (profileFile) {
        profilePictureBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            if (typeof reader.result === 'string') {
              resolve(reader.result)
            } else {
              reject(new Error('Failed to read profile image.'))
            }
          }
          reader.onerror = () => reject(new Error('Failed to read profile image.'))
          reader.readAsDataURL(profileFile)
        })
      }

      const response = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.fullName,
          phone_number: form.phone,
          national_id: form.nationalId,
          address: form.address || null,
          date_of_birth: form.dateOfBirth || null,
          profile_picture_file: profilePictureBase64,
        }),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update tenant.')
      }

      setSuccess('Tenant details updated successfully.')
      setProfileFile(null)
      setTempPreview(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tenant.')
    } finally {
      setSaving(false)
    }
  }

  const leaseLabel = useMemo(() => {
    if (!lease) return 'No lease assigned'
    const unit = lease.unit?.unit_number ? `Unit ${lease.unit.unit_number}` : 'Unit'
    const building = lease.unit?.building?.name || 'Property'
    return `${building} • ${unit}`
  }, [lease])

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <h1 className="text-3xl font-bold">Edit Tenant</h1>
                  <p className="text-sm text-muted-foreground">Update tenant details and contact information.</p>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading tenant details…
              </div>
            ) : error ? (
              <Card className="border-0 shadow bg-white">
                <CardContent className="p-4">
                  <p className="text-sm text-red-600">{error}</p>
                </CardContent>
              </Card>
            ) : (
              <form className="space-y-6" onSubmit={handleSubmit}>
                <Card>
                  <CardHeader>
                    <CardTitle>Tenant Profile</CardTitle>
                    <CardDescription>Keep email fixed to the tenant login username.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Full name</Label>
                      <Input
                        id="fullName"
                        value={form.fullName}
                        onChange={(e) => handleChange('fullName', e.target.value)}
                        placeholder="Tenant full name"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email (read-only)</Label>
                      <Input id="email" type="email" value={form.email} disabled readOnly />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone number</Label>
                      <Input
                        id="phone"
                        value={form.phone}
                        onChange={(e) => handleChange('phone', e.target.value)}
                        placeholder="+2547..."
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nationalId">National ID</Label>
                      <Input
                        id="nationalId"
                        value={form.nationalId}
                        onChange={(e) => handleChange('nationalId', e.target.value)}
                        placeholder="National ID"
                        required
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Profile Picture</CardTitle>
                    <CardDescription>Optional. Upload a clear tenant photo.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4 md:flex-row md:items-center">
                    <div className="flex items-center gap-4">
                      <div className="h-20 w-20 overflow-hidden rounded-full bg-slate-100">
                        {profilePreview ? (
                          <img src={profilePreview} alt="Tenant profile" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                            No image
                          </div>
                        )}
                      </div>
                      <div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                          className="gap-2"
                        >
                          <Camera className="h-4 w-4" /> Change photo
                        </Button>
                        <Input
                          ref={fileInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={handleFileChange}
                        />
                      </div>
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
                        <ChronoSelect
                          value={fromDateString(form.dateOfBirth)}
                          onChange={(date) => handleChange('dateOfBirth', toDateString(date))}
                          placeholder="Select date of birth"
                          className="w-full justify-start"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Current Lease Snapshot</CardTitle>
                    <CardDescription>{lease ? leaseLabel : 'No unit assigned yet.'}</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Status</p>
                      <p className="font-medium">{lease?.status || 'Unassigned'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Lease start</p>
                      <p className="font-medium">{lease?.start_date || '—'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Lease end</p>
                      <p className="font-medium">{lease?.end_date || '—'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Monthly rent</p>
                      <p className="font-medium">
                        {lease?.monthly_rent ? `KES ${Number(lease.monthly_rent).toLocaleString()}` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Deposit</p>
                      <p className="font-medium">
                        {lease?.deposit_amount ? `KES ${Number(lease.deposit_amount).toLocaleString()}` : '—'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={!canSave || saving} className="bg-[#4682B4] hover:bg-[#3a6c93]">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save changes
                  </Button>
                </div>
                <SuccessModal
                  open={Boolean(success)}
                  onOpenChange={(open) => {
                    if (!open) setSuccess(null)
                  }}
                  title="Tenant updated"
                  description={success || undefined}
                  details={[
                    { label: 'Tenant', value: form.fullName || '-' },
                    { label: 'Phone', value: form.phone || '-' },
                  ]}
                  primaryAction={{
                    label: 'Done',
                    onClick: () => setSuccess(null),
                  }}
                />
              </form>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
