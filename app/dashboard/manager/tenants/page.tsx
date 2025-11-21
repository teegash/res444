'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Users, Plus, Search, Filter, LayoutGrid, Rows4, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

type ManagerTenantRecord = {
  tenant_user_id: string
  full_name: string
  phone_number: string | null
  email: string
  profile_picture_url: string | null
  unit_label: string
  unit: {
    unit_number: string | null
    building_name: string | null
    building_location: string | null
  } | null
  monthly_rent: number | null
  lease_status: string
  lease_status_detail: string
  lease_start_date: string | null
  lease_end_date: string | null
  payment_status: string
  payment_status_detail: string
  last_payment_date: string | null
}

function formatRent(value: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'KES —'
  }
  return `KES ${value.toLocaleString()}`
}

function statusVariant(status: string) {
  const normalized = status.toLowerCase()
  if (normalized.includes('paid') || normalized.includes('current')) {
    return 'bg-green-600'
  }
  if (normalized.includes('pending') || normalized.includes('partial')) {
    return 'bg-yellow-600'
  }
  return 'bg-red-600'
}

export default function TenantsManagementPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [tenants, setTenants] = useState<ManagerTenantRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const fetchTenants = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/tenants', { cache: 'no-store' })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load tenants.')
        }
        setTenants(payload.data || [])
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load tenants.')
        setTenants([])
      } finally {
        setLoading(false)
      }
    }

    fetchTenants()
  }, [])

  const filteredTenants = useMemo(() => {
    if (!searchQuery.trim()) {
      return tenants
    }
    const term = searchQuery.toLowerCase()
    return tenants.filter((tenant) => {
      return (
        tenant.full_name.toLowerCase().includes(term) ||
        tenant.unit_label?.toLowerCase().includes(term) ||
        tenant.unit?.building_name?.toLowerCase().includes(term) ||
        tenant.payment_status.toLowerCase().includes(term) ||
        tenant.phone_number?.toLowerCase().includes(term)
      )
    })
  }, [tenants, searchQuery])

  const renderStatusBadge = (tenant: ManagerTenantRecord) => (
    <Link href={`/dashboard/manager/statements/${tenant.tenant_user_id}`} prefetch>
      <Badge
        className={`cursor-pointer px-3 py-1 ${statusVariant(tenant.payment_status)}`}
      >
        {tenant.payment_status}
      </Badge>
    </Link>
  )

  const renderGrid = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )
    }

    if (error) {
      return (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )
    }

    if (filteredTenants.length === 0) {
      return (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No tenants match your criteria.
          </CardContent>
        </Card>
      )
    }

    return (
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredTenants.map((tenant) => (
          <Card key={tenant.tenant_user_id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12 bg-blue-100">
                    {tenant.profile_picture_url ? (
                      <AvatarImage src={tenant.profile_picture_url} alt={tenant.full_name} />
                    ) : (
                      <AvatarFallback className="text-blue-600 font-semibold">
                        {tenant.full_name
                          .split(' ')
                          .map((chunk) => chunk[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div>
                    <CardTitle className="text-base">{tenant.full_name}</CardTitle>
                    <CardDescription>{tenant.unit_label || 'Unit not assigned'}</CardDescription>
                  </div>
                </div>
                {renderStatusBadge(tenant)}
              </div>
              <p className="text-xs text-muted-foreground mt-3">{tenant.payment_status_detail}</p>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Property</p>
                <p className="font-medium">
                  {tenant.unit?.building_name || 'Unassigned'}
                  {tenant.unit?.building_location ? ` · ${tenant.unit.building_location}` : ''}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">Monthly Rent</p>
                  <p className="font-semibold">{formatRent(tenant.monthly_rent)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Last Payment</p>
                  <p className="font-semibold">
                    {tenant.last_payment_date ? new Date(tenant.last_payment_date).toLocaleDateString() : '—'}
                  </p>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {tenant.phone_number && <p>📞 {tenant.phone_number}</p>}
                {tenant.email && <p>📧 {tenant.email}</p>}
              </div>
              <div className="flex gap-2 pt-3 border-t">
                <Button size="sm" variant="outline" className="flex-1">
                  View Details
                </Button>
                <Button size="sm" variant="outline" className="flex-1">
                  Contact
                </Button>
                <Button size="sm" variant="outline">
                  Collect Rent
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const renderList = () => {
    if (loading || error) {
      return renderGrid()
    }

    return (
      <div className="space-y-4">
        {filteredTenants.map((tenant) => (
          <Card key={`${tenant.tenant_user_id}-list`} className="hover:shadow-sm transition-shadow">
            <CardContent className="py-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 bg-blue-100">
                    <AvatarFallback className="text-blue-600 font-semibold">
                      {tenant.full_name
                        .split(' ')
                        .map((chunk) => chunk[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">{tenant.full_name}</p>
                    <p className="text-xs text-muted-foreground">{tenant.unit_label || 'Unit pending'}</p>
                  </div>
                </div>
                <div className="text-sm">
                  <p className="font-medium">{tenant.unit?.building_name || 'Unassigned'}</p>
                  <p className="text-xs text-muted-foreground">{tenant.phone_number || 'No phone on file'}</p>
                </div>
                <div className="text-sm">
                  <p className="font-medium">{formatRent(tenant.monthly_rent)}</p>
                  <p className="text-xs text-muted-foreground">Monthly Rent</p>
                </div>
                <div className="text-sm">
                  <p className="font-medium">
                    {tenant.lease_start_date
                      ? `${new Date(tenant.lease_start_date).toLocaleDateString()} - ${
                          tenant.lease_end_date ? new Date(tenant.lease_end_date).toLocaleDateString() : 'Open'
                        }`
                      : 'Lease pending'}
                  </p>
                  <p className="text-xs text-muted-foreground">Lease Period</p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  {renderStatusBadge(tenant)}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/30 via-white to-white">
      <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/manager">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Tenant Management</h1>
                <p className="text-sm text-muted-foreground">Manage tenants, monitor payments, and access statements.</p>
              </div>
            </div>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Tenant
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="flex-1 relative w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tenants by name, unit, or property..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <Button variant="outline">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'outline'}
                  size="icon"
                  onClick={() => setViewMode('grid')}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  size="icon"
                  onClick={() => setViewMode('list')}
                >
                  <Rows4 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {viewMode === 'grid' ? renderGrid() : renderList()}
      </div>
    </div>
  )
}
