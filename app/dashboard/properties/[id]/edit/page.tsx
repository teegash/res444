'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { SuccessStateCard } from '@/components/ui/success-state-card'
import {
  Loader2,
  ArrowLeft,
  Save,
  Building2,
  MapPin,
  Trash2,
  Camera,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface PropertyFormState {
  name: string
  location: string
  county: string
  totalUnits: string
  occupiedUnits: string
  description: string
  imageUrl: string
  managerName: string
  managerEmail: string
  managerPhone: string
  supportEmail: string
  supportPhone: string
  amenities: string
  notes: string
  publishOnline: boolean
  autoNotify: boolean
}

const defaultForm: PropertyFormState = {
  name: '',
  location: '',
  county: '',
  totalUnits: '',
  occupiedUnits: '',
  description: '',
  imageUrl: '',
  managerName: '',
  managerEmail: '',
  managerPhone: '',
  supportEmail: '',
  supportPhone: '',
  amenities: '',
  notes: '',
  publishOnline: true,
  autoNotify: true,
}

export default function EditPropertyPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const propertyId = useMemo(() => {
    const raw = Array.isArray(params?.id) ? params?.id?.[0] : params?.id
    return raw ? decodeURIComponent(raw).trim() : ''
  }, [params?.id])

  const [form, setForm] = useState<PropertyFormState>(defaultForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successState, setSuccessState] = useState<{
    title: string
    description?: string
    badge?: string
    details?: { label: string; value: string }[]
  } | null>(null)
  const [stats, setStats] = useState<{ recordedUnits: number; occupiedUnits: number } | null>(null)
  const [meta, setMeta] = useState<{ organizationId: string; createdAt: string; updatedAt: string }>({
    organizationId: '',
    createdAt: '',
    updatedAt: '',
  })
  const [imagePreview, setImagePreview] = useState<string>('')
  const [imageFileData, setImageFileData] = useState<string | null>(null)
  const [imageFileName, setImageFileName] = useState<string | null>(null)
  const [imageFileType, setImageFileType] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let isMounted = true

    async function loadProperty() {
      if (!propertyId) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const response = await fetch(
          `/api/properties/${propertyId}?buildingId=${encodeURIComponent(propertyId)}`,
          {
            cache: 'no-store',
            credentials: 'include',
          }
        )
        const result = await response.json()

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error || 'Failed to fetch property data')
        }

        if (isMounted) {
          setForm((prev) => ({
            ...prev,
            name: result.data.name || '',
            location: result.data.location || '',
            county: result.data.county || '',
            totalUnits: result.data.totalUnits?.toString() || '',
            occupiedUnits: result.data.occupiedUnits?.toString() || '',
            description: result.data.description || '',
            imageUrl: result.data.imageUrl || '',
            autoNotify: Boolean(result.data.vacancyAlertsEnabled),
          }))
          setImagePreview(result.data.imageUrl || '')
          setStats({
            recordedUnits: result.data.recordedUnits || result.data.totalUnits || 0,
            occupiedUnits: result.data.occupiedUnits || 0,
          })
          setMeta({
            organizationId: result.data.organizationId || '',
            createdAt: result.data.createdAt || '',
            updatedAt: result.data.updatedAt || '',
          })
        }
      } catch (err) {
        console.error('[EditPropertyPage] Failed to load property', err)
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unable to load property details.')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadProperty()

    return () => {
      isMounted = false
    }
  }, [propertyId])

  const handleChange = (field: keyof PropertyFormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSuccessState(null)
    setError(null)
  }

  const handleImagePick = (file: File | null) => {
    if (!file) return
    setImageError(null)

    if (!file.type.startsWith('image/')) {
      setImageError('Please select a valid image file.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (!result) {
        setImageError('Unable to read the selected image.')
        return
      }
      setImagePreview(result)
      setImageFileData(result)
      setImageFileName(file.name)
      setImageFileType(file.type)
    }
    reader.onerror = () => {
      setImageError('Failed to read the selected image.')
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!propertyId) {
      setError('Missing property identifier.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccessState(null)

    try {
      const payload: Record<string, any> = {
        name: form.name.trim(),
        location: form.location.trim(),
        description: form.description.trim(),
        image_url: form.imageUrl.trim(),
        vacancy_alerts_enabled: Boolean(form.autoNotify),
      }

      if (form.totalUnits !== '') {
        const total = Number(form.totalUnits)
        if (!Number.isNaN(total) && total >= 0) {
          payload.total_units = total
        }
      }

      if (imageFileData) {
        payload.image_file = imageFileData
        if (imageFileType) payload.image_file_type = imageFileType
        if (imageFileName) payload.image_file_name = imageFileName
      }

      const response = await fetch(`/api/properties/${propertyId}?buildingId=${encodeURIComponent(propertyId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, building_id: propertyId }),
        credentials: 'include',
      })
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update property.')
      }

      setSuccessState({
        title: 'Property updated successfully',
        description: 'Changes saved and ready for tenants.',
        badge: 'Update saved',
        details: [
          { label: 'Property', value: form.name.trim() || 'Property' },
          { label: 'Location', value: form.location.trim() || '—' },
          { label: 'Units', value: form.totalUnits || String(stats?.recordedUnits || 0) },
        ],
      })
      setImageFileData(null)
      setImageFileName(null)
      setImageFileType(null)
      setImageError(null)
    } catch (err) {
      console.error('[EditPropertyPage] Update failed', err)
      setError(err instanceof Error ? err.message : 'Failed to save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const canSave = form.name.trim().length > 0 && form.location.trim().length > 0
  const canDelete = !!propertyId && !loading && !saving && !deleting
  const isDeleted = successState?.badge === 'Property deleted'

  const handleDelete = async () => {
    if (!propertyId) {
      setError('Missing property identifier.')
      return
    }

    setDeleting(true)
    setError(null)
    setSuccessState(null)

    try {
      const response = await fetch(`/api/properties/${propertyId}?buildingId=${encodeURIComponent(propertyId)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const result = await response.json().catch(() => ({}))

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to delete property.')
      }

      setSuccessState({
        title: 'Property deleted successfully',
        description: 'This building has been removed from your portfolio.',
        badge: 'Property deleted',
        details: [
          { label: 'Property', value: form.name.trim() || 'Property' },
          { label: 'Location', value: form.location.trim() || '—' },
        ],
      })
    } catch (err) {
      console.error('[EditPropertyPage] Delete failed', err)
      setError(err instanceof Error ? err.message : 'Failed to delete property. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <p className="text-xs text-gray-500">Property ID</p>
                  <h1 className="text-2xl font-bold text-gray-900">Edit Property</h1>
                  <p className="text-sm text-muted-foreground">{propertyId || 'Draft property'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {loading && <Loader2 className="w-5 h-5 animate-spin text-[#4682B4]" />}
                {propertyId && (
                  <Button variant="outline" onClick={() => router.push(`/dashboard/properties/${propertyId}`)}>
                    View summary
                  </Button>
                )}
                {propertyId && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" disabled={!canDelete} className="gap-2">
                        {deleting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Deleting...
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </>
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this property?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete the property and all related data (units, leases, rent & water invoices,
                          payments, maintenance requests, expenses, and tenant accounts linked only to this property). This action
                          cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={(e) => {
                            e.preventDefault()
                            handleDelete()
                          }}
                          className="bg-destructive text-white hover:bg-destructive/90"
                          disabled={!canDelete}
                        >
                          Confirm delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>

            {successState ? (
              <SuccessStateCard
                title={successState.title}
                description={successState.description}
                badge={successState.badge}
                details={successState.details}
                onBack={() => router.push('/dashboard/properties')}
                actions={
                  <>
                    {!isDeleted && <Button onClick={() => setSuccessState(null)}>Edit again</Button>}
                    <Button
                      variant={isDeleted ? 'default' : 'outline'}
                      onClick={() => router.push('/dashboard/properties')}
                    >
                      View properties
                    </Button>
                    {isDeleted ? (
                      <Button variant="outline" onClick={() => router.push('/dashboard/properties/new')}>
                        Add property
                      </Button>
                    ) : null}
                  </>
                }
              />
            ) : (
              <>
                {error && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <form className="space-y-6" onSubmit={handleSubmit}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-[#4682B4]" /> Building Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Property image</Label>
                    <div className="relative overflow-hidden rounded-xl border bg-slate-100">
                      <img
                        src={imagePreview || form.imageUrl || '/placeholder.jpg'}
                        alt="Property preview"
                        className="h-48 w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute bottom-3 right-3 inline-flex items-center justify-center rounded-full bg-white/90 text-gray-800 shadow-md h-10 w-10 hover:bg-white"
                        aria-label="Change property image"
                      >
                        <Camera className="h-5 w-5" />
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null
                          handleImagePick(file)
                          e.currentTarget.value = ''
                        }}
                      />
                    </div>
                    {imageFileData && (
                      <p className="text-xs text-muted-foreground">New image selected. Save to upload.</p>
                    )}
                    {imageError && <p className="text-xs text-red-600">{imageError}</p>}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="name">Property name *</Label>
                      <Input
                        id="name"
                        placeholder="e.g. Kilimani Heights"
                        value={form.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="image">Featured image URL</Label>
                      <Input
                        id="image"
                        placeholder="https://example.com/image.jpg"
                        value={form.imageUrl}
                        onChange={(e) => handleChange('imageUrl', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="location" className="flex items-center gap-1">
                        <MapPin className="w-4 h-4 text-muted-foreground" /> Location *
                      </Label>
                      <Input
                        id="location"
                        placeholder="Neighborhood, City"
                        value={form.location}
                        onChange={(e) => handleChange('location', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="county">County / Region</Label>
                      <Input
                        id="county"
                        placeholder="e.g. Nairobi"
                        value={form.county}
                        onChange={(e) => handleChange('county', e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      rows={4}
                      placeholder="Highlight amenities, neighbourhood insights, or property history."
                      value={form.description}
                      onChange={(e) => handleChange('description', e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Capacity & Occupancy</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <Label htmlFor="totalUnits">Total units *</Label>
                      <Input
                        id="totalUnits"
                        type="number"
                        min={0}
                        value={form.totalUnits}
                        onChange={(e) => handleChange('totalUnits', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="occupiedUnits">Occupied units (system)</Label>
                      <Input
                        id="occupiedUnits"
                        type="number"
                        min={0}
                        readOnly
                        className="bg-muted"
                        value={stats?.occupiedUnits ?? Number(form.occupiedUnits || 0)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="recordedUnits">Recorded units (system)</Label>
                      <Input
                        id="recordedUnits"
                        type="number"
                        readOnly
                        className="bg-muted"
                        value={stats?.recordedUnits ?? Number(form.totalUnits || 0)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm">Automation</Label>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">Vacancy alerts</p>
                        <p className="text-xs text-muted-foreground">Notify team when occupancy changes</p>
                      </div>
                      <Switch
                        checked={form.autoNotify}
                        onCheckedChange={(checked) => handleChange('autoNotify', checked)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/*
              <Card>
                <CardHeader>
                  <CardTitle>Contacts & Ownership</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <Label htmlFor="managerName">Property manager</Label>
                      <Input
                        id="managerName"
                        placeholder="Jane Manager"
                        value={form.managerName}
                        onChange={(e) => handleChange('managerName', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="managerPhone">Manager phone</Label>
                      <Input
                        id="managerPhone"
                        placeholder="+254712345678"
                        value={form.managerPhone}
                        onChange={(e) => handleChange('managerPhone', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="managerEmail">Manager email</Label>
                      <Input
                        id="managerEmail"
                        type="email"
                        placeholder="manager@example.com"
                        value={form.managerEmail}
                        onChange={(e) => handleChange('managerEmail', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="supportEmail">Support email</Label>
                      <Input
                        id="supportEmail"
                        type="email"
                        placeholder="support@example.com"
                        value={form.supportEmail}
                        onChange={(e) => handleChange('supportEmail', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="supportPhone">Support phone</Label>
                      <Input
                        id="supportPhone"
                        placeholder="+254700000000"
                        value={form.supportPhone}
                        onChange={(e) => handleChange('supportPhone', e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
              */}

              <Card>
                <CardHeader>
                  <CardTitle>Additional Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="organizationId">Organization ID</Label>
                      <Input
                        id="organizationId"
                        value={meta.organizationId || '—'}
                        readOnly
                        className="bg-muted"
                      />
                    </div>
                    <div>
                      <Label htmlFor="createdAt">Created</Label>
                      <Input
                        id="createdAt"
                        value={meta.createdAt ? new Date(meta.createdAt).toLocaleString() : '—'}
                        readOnly
                        className="bg-muted"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="updatedAt">Last updated</Label>
                      <Input
                        id="updatedAt"
                        value={meta.updatedAt ? new Date(meta.updatedAt).toLocaleString() : '—'}
                        readOnly
                        className="bg-muted"
                      />
                    </div>
                    <div>
                      <Label htmlFor="image-preview">Image preview</Label>
                      <div className="rounded-lg border bg-muted overflow-hidden h-32 flex items-center justify-center">
                        {form.imageUrl ? (
                          <img src={form.imageUrl} alt="Property" className="object-cover h-full w-full" />
                        ) : (
                          <p className="text-xs text-muted-foreground">No image provided</p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/dashboard/properties')}
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
                      <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" /> Save changes
                    </>
                  )}
                </Button>
              </div>
                </form>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
