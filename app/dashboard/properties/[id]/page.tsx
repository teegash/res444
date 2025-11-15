'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ArrowLeft, MapPin, Building2 } from 'lucide-react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'

interface PropertyDetail {
  id: string
  name: string
  location: string
  description: string | null
  imageUrl: string | null
  organizationId: string | null
  totalUnits: number
  recordedUnits: number
  occupiedUnits: number
  createdAt: string | null
  updatedAt: string | null
}

interface UnitSummary {
  id: string
  unit_number: string
  floor: number | null
  number_of_bedrooms: number | null
  number_of_bathrooms: number | null
  size_sqft: number | null
  status: string | null
  unit_price_category: string | null
}

export default function PropertyDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const propertyId = useMemo(() => {
    const raw = Array.isArray(params?.id) ? params?.id[0] : params?.id
    return raw ? decodeURIComponent(raw).trim() : ''
  }, [params?.id])

  const [property, setProperty] = useState<PropertyDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [units, setUnits] = useState<UnitSummary[]>([])
  const [unitsLoading, setUnitsLoading] = useState(false)

  useEffect(() => {
    let isMounted = true
    async function fetchProperty() {
      if (!propertyId) {
        setError('Missing property identifier.')
        setLoading(false)
        return
      }
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(
          `/api/properties/${propertyId}?buildingId=${encodeURIComponent(propertyId)}`,
          { cache: 'no-store', credentials: 'include' }
        )
        const result = await response.json()
        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error || 'Failed to load property.')
        }
        if (isMounted) {
          setProperty(result.data)
        }
      } catch (err) {
        console.error('[PropertyDetailPage] Fetch failed', err)
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unable to load property details.')
          setProperty(null)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchProperty()
    return () => {
      isMounted = false
    }
  }, [propertyId])

  useEffect(() => {
    let isMounted = true
    async function loadUnits() {
      if (!propertyId) return
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
        if (isMounted) {
          setUnits(Array.isArray(result.data?.units) ? result.data.units : [])
        }
      } catch (err) {
        console.error('[PropertyDetailPage] Units fetch failed', err)
      } finally {
        if (isMounted) {
          setUnitsLoading(false)
        }
      }
    }
    loadUnits()
    return () => {
      isMounted = false
    }
  }, [propertyId])

  const occupancy = property?.totalUnits
    ? Math.min(100, Math.round((property.occupiedUnits / property.totalUnits) * 100))
    : 0

  const heroImage =
    property?.imageUrl && property.imageUrl.length > 4
      ? property.imageUrl
      : '/modern-residential-building.png'

  const prioritizedUnits = useMemo(() => {
    if (!units.length) return []
    const vacant = units.filter((unit) => (unit.status || '').toLowerCase() === 'vacant')
    const others = units.filter((unit) => (unit.status || '').toLowerCase() !== 'vacant')
    return [...vacant, ...others]
  }, [units])

  const displayedUnits = unitsLoading
    ? Array.from({ length: 8 })
    : prioritizedUnits.slice(0, 8)

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/properties')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <p className="text-xs text-muted-foreground">Property</p>
            <h1 className="text-3xl font-bold text-gray-900">
              {property?.name || (loading ? 'Loading…' : 'Unknown property')}
            </h1>
            {property?.location && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {property.location}
              </p>
            )}
          </div>
        </div>
        {propertyId && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.push(`/dashboard/properties/${propertyId}/edit`)}
            >
              Edit property
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/dashboard/property/${propertyId}/unit_management`)}
            >
              Manage units
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-muted/50 overflow-hidden">
        <div
          className="h-64 w-full bg-cover bg-center"
          style={{ backgroundImage: `url('${heroImage}')` }}
        />
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#4682B4]" /> Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4" />
              <span>{property?.location || '—'}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Organization ID</p>
              <p className="font-medium">{property?.organizationId || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Created</p>
              <p className="font-medium">
                {property?.createdAt ? new Date(property.createdAt).toLocaleString() : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last updated</p>
              <p className="font-medium">
                {property?.updatedAt ? new Date(property.updatedAt).toLocaleString() : '—'}
              </p>
            </div>
            {property?.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">{property.description}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Capacity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Recorded units</p>
                <p className="text-2xl font-bold">{property?.recordedUnits ?? '—'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total units</p>
                <p className="text-2xl font-bold">{property?.totalUnits ?? '—'}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Occupancy</p>
              <Progress value={occupancy} />
              <p className="text-xs mt-1 text-muted-foreground">
                {property?.occupiedUnits ?? 0} / {property?.totalUnits ?? 0} units occupied ({occupancy}%)
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Property state</span>
              <Badge className="bg-green-600">Active</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Vacant units</p>
                <p className="text-lg font-semibold">
                  {(property?.totalUnits || 0) - (property?.occupiedUnits || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Occupancy trend</p>
                <p className="text-lg font-semibold">{occupancy}%</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              This summary reflects the live data stored in Supabase for this property.
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Units snapshot</h2>
            <p className="text-sm text-muted-foreground">
              Showing up to eight units (vacant units first) pulled directly from the units table.
            </p>
          </div>
          <Button
            variant="ghost"
            className="text-[#4682B4]"
            onClick={() => propertyId && router.push(`/dashboard/property/${propertyId}/unit_management`)}
          >
            View all units
          </Button>
        </div>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {displayedUnits.map((unit, index) => (
            <Card
              key={unit?.id ?? `placeholder-${index}`}
              className="border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div>
                  <p className="text-xs text-muted-foreground">Unit</p>
                  <h3 className="text-lg font-semibold">
                    {unit?.unit_number || (unitsLoading ? 'Loading…' : '—')}
                  </h3>
                </div>
                <Badge variant={unit?.status === 'occupied' ? 'default' : 'secondary'}>
                  {(unit?.status || 'unknown').replace('_', ' ')}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Bedrooms</p>
                    <p className="font-medium">{unit?.number_of_bedrooms ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Bathrooms</p>
                    <p className="font-medium">{unit?.number_of_bathrooms ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Floor</p>
                    <p className="font-medium">{unit?.floor ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Size (sq ft)</p>
                    <p className="font-medium">{unit?.size_sqft ?? '—'}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Price Category</p>
                  <p className="font-medium">{unit?.unit_price_category ?? '—'}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    size="sm"
                    onClick={() =>
                      propertyId &&
                      router.push(`/dashboard/property/${propertyId}/unit_management`)
                    }
                  >
                    Edit unit
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1"
                    size="sm"
                    disabled={(unit?.status || '').toLowerCase() !== 'vacant'}
                    onClick={() => {
                      if (!propertyId || !unit?.id) return
                      const params = new URLSearchParams({
                        propertyId,
                        unitId: unit.id,
                        unitNumber: unit.unit_number || '',
                      })
                      router.push(`/dashboard/tenants?${params.toString()}`)
                    }}
                  >
                    Add tenant
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {!loading && !property && !error && (
        <p className="text-sm text-muted-foreground">Property details could not be loaded.</p>
      )}
          </div>
        </main>
      </div>
    </div>
  )
}
