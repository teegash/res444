'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, MoreVertical, Copy, Phone, ChevronDown, Check } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import Link from 'next/link'
import { SkeletonTable } from '@/components/ui/skeletons'

type TenantRecord = {
  lease_id: string | null
  tenant_user_id: string
  full_name: string
  email: string
  phone_number: string
  national_id: string
  profile_picture_url: string | null
  address: string | null
  date_of_birth: string | null
  created_at: string | null
  lease_status: string
  lease_start_date: string | null
  lease_end_date: string | null
  monthly_rent: number | null
  deposit_amount: number | null
  payment_status: string
  payment_status_detail?: string
  last_payment_date?: string | null
  unit_label: string
}

interface TenantsTableProps {
  searchQuery?: string
  viewMode?: 'grid' | 'list'
  propertyId?: string | null
}

const getInitials = (value: string) => {
  const parts = value.split(' ').filter(Boolean)
  if (parts.length === 0) return 'TN'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

const formatDisplayDate = (value: string | null) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const currencyFormatter = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  minimumFractionDigits: 0,
})

const formatCurrency = (value: number | null | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return currencyFormatter.format(value)
}

const leaseBadgeClass = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'active':
      return 'bg-green-50 text-green-700 border-green-200'
    case 'valid':
      return 'bg-green-100 text-green-800 border-green-200'
    case 'renewed':
      return 'bg-sky-100 text-sky-700 border-sky-200'
    case 'expired':
      return 'bg-rose-300 text-rose-950 border-rose-400'
    case 'pending':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'unassigned':
      return 'bg-slate-50 text-slate-600 border-slate-200'
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200'
  }
}

const isLeaseExpired = (tenant: TenantRecord) => {
  const status = (tenant.lease_status || '').toLowerCase()
  if (status === 'expired') return true
  if (!tenant.lease_end_date) return false
  const parsed = new Date(tenant.lease_end_date)
  if (Number.isNaN(parsed.getTime())) return false
  const today = new Date()
  const endDay = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
  const currentDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return currentDay > endDay
}

const ratingBucket = (rate?: number | null) => {
  if (rate === undefined || rate === null) return 'none'
  if (rate >= 95) return 'green'
  if (rate >= 87) return 'yellow'
  if (rate >= 80) return 'orange'
  return 'red'
}

const paymentBadgeVariant = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'paid':
      return 'default' as const
    case 'pending':
    case 'pending_setup':
    case 'setup pending':
    case 'pending verification':
    case 'partial':
      return 'outline' as const
    default:
      return 'destructive' as const
  }
}

const buildStatementHref = (tenantId?: string | null) =>
  tenantId ? `/dashboard/manager/statements/${encodeURIComponent(tenantId)}` : ''

const ratingMeta = (rate?: number) => {
  if (rate === undefined || rate === null) {
    return { color: 'bg-slate-300', label: 'No rating available' }
  }
  if (rate >= 95) return { color: 'bg-green-500', label: 'Excellent (95-100%)' }
  if (rate >= 87) return { color: 'bg-yellow-400', label: 'Good (87-94%)' }
  if (rate >= 80) return { color: 'bg-orange-500', label: 'Fair (80-86%)' }
  return { color: 'bg-red-500', label: 'Needs improvement (<80%)' }
}

function TenantActions({
  tenant,
  onEdit,
  onRemove,
}: {
  tenant: TenantRecord
  onEdit: (tenant: TenantRecord) => void
  onRemove: (tenant: TenantRecord) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit(tenant)}>Edit</DropdownMenuItem>
        {tenant.tenant_user_id ? (
          <DropdownMenuItem asChild>
            <Link href={buildStatementHref(tenant.tenant_user_id)}>Stmt</Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/tenants/${tenant.tenant_user_id}/messages?tenantId=${tenant.tenant_user_id}`}>
            Open Chat
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/tenants/${tenant.tenant_user_id}/lease`}>Lease</Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onRemove(tenant)}
          className="text-destructive focus:text-destructive"
        >
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TenantsTable({ searchQuery = '', viewMode = 'list', propertyId }: TenantsTableProps) {
  const { toast } = useToast()
  const [tenants, setTenants] = useState<TenantRecord[]>([])
  const [ratingsMap, setRatingsMap] = useState<Record<string, { on_time_rate: number; payments: number }>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshIndex, setRefreshIndex] = useState(0)
  const [ratingFilter, setRatingFilter] = useState<'all' | 'red' | 'orange' | 'yellow' | 'green' | 'none'>('all')
  const [leaseStatusFilter, setLeaseStatusFilter] = useState<
    'all' | 'valid' | 'renewed' | 'pending' | 'expired' | 'unassigned'
  >('all')
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'unpaid'>('all')

  const [editTenant, setEditTenant] = useState<TenantRecord | null>(null)
  const [editForm, setEditForm] = useState({
    full_name: '',
    email: '',
    phone_number: '',
    national_id: '',
    address: '',
    date_of_birth: '',
  })
  const [savingEdit, setSavingEdit] = useState(false)
  const [editSuccess, setEditSuccess] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const [tenantToDelete, setTenantToDelete] = useState<TenantRecord | null>(null)
  const [removingTenant, setRemovingTenant] = useState(false)

  useEffect(() => {
    const fetchTenants = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/tenants', { cache: 'no-store' })
        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({}))
          throw new Error(errorPayload.error || 'Failed to fetch tenants.')
        }
        const payload = await response.json()
        const data: TenantRecord[] = payload.data || []
        const filteredByScope = propertyId
          ? data.filter((tenant: any) => tenant?.unit?.building_id === propertyId)
          : data
        setTenants(filteredByScope)
      } catch (requestError) {
        console.error('[TenantsTable] fetch error', requestError)
        setError(requestError instanceof Error ? requestError.message : 'Unable to load tenants.')
      } finally {
        setLoading(false)
      }
    }

    fetchTenants()
  }, [refreshIndex])

  useEffect(() => {
    const fetchRatings = async () => {
      try {
        const res = await fetch('/api/dashboard/manager/tenant-ratings', { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Failed to load tenant ratings')
        }
        const map: Record<string, { on_time_rate: number; payments: number }> = {}
        ;(json.data || []).forEach((item: any) => {
          if (item?.tenant_id) {
            map[item.tenant_id] = {
              on_time_rate: Number(item.on_time_rate || 0),
              payments: Number(item.payments || 0),
            }
          }
        })
        setRatingsMap(map)
      } catch (err) {
        console.warn('[TenantsTable] ratings load failed', err)
        setRatingsMap({})
      }
    }

    fetchRatings()
  }, [refreshIndex])

  useEffect(() => {
    if (editTenant) {
      setEditForm({
        full_name: editTenant.full_name || '',
        email: editTenant.email || '',
        phone_number: editTenant.phone_number || '',
        national_id: editTenant.national_id || '',
        address: editTenant.address || '',
        date_of_birth: editTenant.date_of_birth
          ? new Date(editTenant.date_of_birth).toISOString().split('T')[0]
          : '',
      })
      setEditSuccess(null)
      setEditError(null)
    }
  }, [editTenant])

  const filteredTenants = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    let list = tenants
    if (query) {
      list = list.filter((tenant) => {
        return [
          tenant.full_name,
          tenant.email,
          tenant.phone_number,
          tenant.unit_label,
          tenant.national_id,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().startsWith(query))
      })
    }

    if (ratingFilter !== 'all') {
      list = list.filter((tenant) => {
        const rating = ratingsMap[tenant.tenant_user_id]
        return ratingBucket(rating?.on_time_rate) === ratingFilter
      })
    }

    if (leaseStatusFilter !== 'all') {
      list = list.filter((tenant) => (tenant.lease_status || '').toLowerCase() === leaseStatusFilter)
    }

    if (paymentFilter === 'paid') {
      list = list.filter((tenant) => (tenant.payment_status || '').toLowerCase() === 'paid')
    } else if (paymentFilter === 'unpaid') {
      list = list.filter((tenant) => (tenant.payment_status || '').toLowerCase() !== 'paid')
    }

    return list
  }, [leaseStatusFilter, paymentFilter, ratingFilter, ratingsMap, searchQuery, tenants])

  const viewTenants = useMemo(() => {
    if (loading) {
      return []
    }
    return filteredTenants
  }, [filteredTenants, loading])

  const ratingFilterLabel = (() => {
    switch (ratingFilter) {
      case 'red':
        return 'Red rating'
      case 'orange':
        return 'Orange rating'
      case 'yellow':
        return 'Yellow rating'
      case 'green':
        return 'Green rating'
      case 'none':
        return 'No rating'
      default:
        return 'All ratings'
    }
  })()

  const leaseFilterLabel = (() => {
    switch (leaseStatusFilter) {
      case 'valid':
        return 'Valid'
      case 'renewed':
        return 'Renewed'
      case 'pending':
        return 'Pending'
      case 'expired':
        return 'Expired'
      case 'unassigned':
        return 'Unassigned'
      default:
        return 'All statuses'
    }
  })()

  const paymentFilterLabel =
    paymentFilter === 'paid' ? 'Paid' : paymentFilter === 'unpaid' ? 'Unpaid' : 'All'

  const renderFilterMenu = (
    options: Array<{ value: string; label: string }>,
    value: string,
    onChange: (value: string) => void,
    align: 'start' | 'end' = 'start'
  ) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground transition hover:text-foreground"
          aria-label="Open filter menu"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {options.map((option) => (
          <DropdownMenuItem key={option.value} onClick={() => onChange(option.value)}>
            <span className="flex items-center gap-2">
              {value === option.value ? <Check className="h-4 w-4 text-primary" /> : <span className="h-4 w-4" />}
              {option.label}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const ratingOptions = [
    { value: 'all', label: 'All ratings' },
    { value: 'red', label: 'Red rating' },
    { value: 'orange', label: 'Orange rating' },
    { value: 'yellow', label: 'Yellow rating' },
    { value: 'green', label: 'Green rating' },
    { value: 'none', label: 'No rating' },
  ]
  const leaseOptions = [
    { value: 'all', label: 'All statuses' },
    { value: 'valid', label: 'Valid' },
    { value: 'renewed', label: 'Renewed' },
    { value: 'pending', label: 'Pending' },
    { value: 'expired', label: 'Expired' },
    { value: 'unassigned', label: 'Unassigned' },
  ]
  const paymentOptions = [
    { value: 'all', label: 'All payments' },
    { value: 'paid', label: 'Paid' },
    { value: 'unpaid', label: 'Unpaid' },
  ]

  const handleCopy = (value: string, label: string) => {
    if (!value) return
    navigator.clipboard.writeText(value).then(() => {
      toast({
        title: `${label} copied`,
        description: value,
      })
    })
  }

  const handleSaveEdit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!editTenant) return
    const tenantId = editTenant.tenant_user_id
    if (!tenantId) {
      const message = 'Tenant record is missing an id. Please refresh and try again.'
      setEditError(message)
      toast({
        title: 'Update failed',
        description: message,
        variant: 'destructive',
      })
      return
    }
    setSavingEdit(true)
    setEditError(null)
    try {
      const payload = {
        tenant_user_id: tenantId,
        full_name: editForm.full_name,
        phone_number: editForm.phone_number,
        national_id: editForm.national_id,
        address: editForm.address,
        date_of_birth: editForm.date_of_birth || null,
      }

      const response = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}))
        throw new Error(errorPayload.error || 'Failed to update tenant.')
      }

      setEditSuccess('Tenant details updated successfully.')
      setRefreshIndex((index) => index + 1)
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Unable to save changes.'
      toast({
        title: 'Update failed',
        description: message,
        variant: 'destructive',
      })
      setEditError(message)
    } finally {
      setSavingEdit(false)
    }
  }

  const handleRemoveTenant = async () => {
    if (!tenantToDelete) return
    setRemovingTenant(true)
    try {
      const response = await fetch(`/api/tenants/${tenantToDelete.tenant_user_id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}))
        throw new Error(errorPayload.error || 'Failed to remove tenant.')
      }

      toast({
        title: 'Tenant removed',
        description: `${tenantToDelete.full_name} has been removed from your roster.`,
      })
      setTenantToDelete(null)
      setRefreshIndex((index) => index + 1)
    } catch (deleteError) {
      toast({
        title: 'Removal failed',
        description: deleteError instanceof Error ? deleteError.message : 'Removal failed.',
        variant: 'destructive',
      })
    } finally {
      setRemovingTenant(false)
    }
  }

  return (
    <TooltipProvider>
      <div className="border border-border rounded-lg bg-white">
        {error && (
          <Alert variant="destructive" className="m-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {viewMode === 'grid' && (
          <div className="flex flex-wrap items-center gap-4 border-b bg-slate-50/60 px-4 py-3 text-xs text-slate-600">
            <div className="flex items-center gap-1">
              <span className="font-semibold">Tenant rating</span>
              <span className="text-slate-500">{ratingFilterLabel}</span>
              {renderFilterMenu(ratingOptions, ratingFilter, (value) =>
                setRatingFilter(value as typeof ratingFilter)
              )}
            </div>
            <div className="flex items-center gap-1">
              <span className="font-semibold">Lease status</span>
              <span className="text-slate-500">{leaseFilterLabel}</span>
              {renderFilterMenu(leaseOptions, leaseStatusFilter, (value) =>
                setLeaseStatusFilter(value as typeof leaseStatusFilter)
              )}
            </div>
            <div className="flex items-center gap-1">
              <span className="font-semibold">Payment</span>
              <span className="text-slate-500">{paymentFilterLabel}</span>
              {renderFilterMenu(paymentOptions, paymentFilter, (value) =>
                setPaymentFilter(value as typeof paymentFilter)
              )}
            </div>
          </div>
        )}

        {viewMode === 'grid' ? (
          <div className="p-4">
            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {viewTenants.map((tenant) => (
                <div
                  key={`card-${tenant.tenant_user_id}`}
                  className={`rounded-xl border shadow-sm transition-shadow ${
                    isLeaseExpired(tenant)
                      ? 'border-rose-400 bg-rose-200/90'
                      : 'bg-white hover:shadow-md'
                  }`}
                >
                  <div className="p-4 border-b flex items-center gap-3">
                    <Avatar className="h-12 w-12 border">
                      {tenant.profile_picture_url ? (
                        <AvatarImage src={tenant.profile_picture_url} alt={tenant.full_name} />
                      ) : (
                        <AvatarFallback>{getInitials(tenant.full_name)}</AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-semibold leading-tight">{tenant.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {tenant.unit_label || 'Unassigned'}
                      </p>
                    </div>
                    {tenant.tenant_user_id ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={buildStatementHref(tenant.tenant_user_id)}>Stmt</Link>
                      </Button>
                    ) : null}
                  </div>
                  <div className="p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Email</span>
                      <span className="font-medium truncate max-w-[55%]">{tenant.email || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Phone</span>
                      <span className="font-medium">{tenant.phone_number || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Rent</span>
                      <span className="font-medium">{formatCurrency(tenant.monthly_rent)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Lease</span>
                      <Badge variant="outline" className={leaseBadgeClass(tenant.lease_status)}>
                        {tenant.lease_status}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Payment</span>
                      <Badge variant={paymentBadgeVariant(tenant.payment_status)}>
                        {tenant.payment_status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-3">
                      <Button size="sm" variant="outline" onClick={() => setEditTenant(tenant)}>
                        Edit
                      </Button>
                      {tenant.tenant_user_id ? (
                        <Button size="sm" variant="secondary" asChild>
                          <Link href={buildStatementHref(tenant.tenant_user_id)}>Statement</Link>
                        </Button>
                      ) : (
                        <Button size="sm" variant="secondary" disabled>
                          Statement
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {viewTenants.length === 0 && (
                <div className="col-span-full text-center text-sm text-muted-foreground py-12">
                  No tenants found.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <div className="flex items-center gap-1">
                    <span>Tenant Name</span>
                    {renderFilterMenu(ratingOptions, ratingFilter, (value) =>
                      setRatingFilter(value as typeof ratingFilter)
                    )}
                  </div>
                </TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>
                  <div className="flex items-center gap-1">
                    <span>Lease Status</span>
                    {renderFilterMenu(leaseOptions, leaseStatusFilter, (value) =>
                      setLeaseStatusFilter(value as typeof leaseStatusFilter)
                    )}
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center gap-1">
                    <span>Payment Status</span>
                    {renderFilterMenu(paymentOptions, paymentFilter, (value) =>
                      setPaymentFilter(value as typeof paymentFilter)
                    )}
                  </div>
                </TableHead>
                <TableHead>Lease Start</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={8} className="py-6">
                    <SkeletonTable rows={4} columns={6} />
                  </TableCell>
                </TableRow>
              )}

              {!loading && filteredTenants.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    {searchQuery
                      ? 'No tenants match your search.'
                      : 'No active tenants yet. Add a tenant to get started.'}
                  </TableCell>
                </TableRow>
              )}

              {!loading &&
                filteredTenants.map((tenant) => {
                  const rating = ratingsMap[tenant.tenant_user_id]
                  const meta = ratingMeta(rating?.on_time_rate)
                  const expired = isLeaseExpired(tenant)
                  return (
                  <TableRow key={tenant.lease_id} className={expired ? 'bg-rose-200/90' : undefined}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          {tenant.profile_picture_url ? (
                            <AvatarImage src={tenant.profile_picture_url} alt={tenant.full_name} />
                          ) : null}
                          <AvatarFallback>{getInitials(tenant.full_name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={`h-2.5 w-2.5 rounded-full ${meta.color}`}
                                  aria-label="Tenant rating indicator"
                                />
                              </TooltipTrigger>
                              <TooltipContent className="bg-black text-white text-xs">
                                <div className="space-y-1">
                                  <p className="font-semibold">
                                    {meta.label}
                                  </p>
                                  <p>
                                    {rating
                                      ? `${rating.on_time_rate}% on time • ${rating.payments} payments`
                                      : 'No payment history yet.'}
                                  </p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                            <p className="font-medium leading-tight">{tenant.full_name}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            ID: {tenant.national_id || 'Not Provided'}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{tenant.email || '—'}</span>
                        {tenant.email && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleCopy(tenant.email, 'Email')}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{tenant.phone_number || '—'}</span>
                        {tenant.phone_number && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleCopy(tenant.phone_number, 'Phone')}
                          >
                            <Phone className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{tenant.unit_label}</TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className={`${leaseBadgeClass(tenant.lease_status)} cursor-help`}
                          >
                            {tenant.lease_status || 'Unknown'}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent className="space-y-1 text-xs">
                          <p>
                            <span className="font-semibold">Start:</span>{' '}
                            {formatDisplayDate(tenant.lease_start_date)}
                          </p>
                          <p>
                            <span className="font-semibold">End:</span>{' '}
                            {tenant.lease_end_date ? formatDisplayDate(tenant.lease_end_date) : 'N/A'}
                          </p>
                          <p>
                            <span className="font-semibold">Monthly rent:</span>{' '}
                            {formatCurrency(tenant.monthly_rent)}
                          </p>
                          <p>
                            <span className="font-semibold">Deposit:</span>{' '}
                            {formatCurrency(tenant.deposit_amount)}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant={paymentBadgeVariant(tenant.payment_status)}>
                            {tenant.payment_status || 'Unknown'}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent className="space-y-1 text-xs max-w-xs">
                          <p>{tenant.payment_status_detail || 'No payment activity recorded yet.'}</p>
                          <p className="text-muted-foreground">
                            Last payment:{' '}
                            {tenant.last_payment_date
                              ? formatDisplayDate(tenant.last_payment_date)
                              : 'Not recorded'}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDisplayDate(tenant.lease_start_date)}
                    </TableCell>
                    <TableCell className="text-right">
                      <TenantActions tenant={tenant} onEdit={setEditTenant} onRemove={setTenantToDelete} />
                    </TableCell>
                  </TableRow>
                )})}
            </TableBody>
          </Table>
          </div>
        )}
      </div>

      {/* Send message modal */}

      {/* Edit tenant modal */}
      <Dialog
        open={!!editTenant}
        onOpenChange={(open) => {
          if (!open) {
            setEditTenant(null)
            setEditSuccess(null)
            setEditError(null)
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Edit tenant details</DialogTitle>
              <DialogDescription>
                Update contact information or identifiers. Lease adjustments will be handled from the lease
                module.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full name</Label>
                <Input
                  id="full_name"
                  value={editForm.full_name}
                  onChange={(event) =>
                    setEditForm((state) => ({ ...state, full_name: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
              <Label htmlFor="email">Email (username)</Label>
              <Input
                id="email"
                type="email"
                value={editForm.email}
                disabled
                readOnly
              />
            </div>
              <div className="space-y-2">
                <Label htmlFor="phone_number">Phone number</Label>
                <Input
                  id="phone_number"
                  value={editForm.phone_number}
                  onChange={(event) =>
                    setEditForm((state) => ({ ...state, phone_number: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="national_id">National ID</Label>
                <Input
                  id="national_id"
                  value={editForm.national_id}
                  onChange={(event) =>
                    setEditForm((state) => ({ ...state, national_id: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={editForm.address}
                  onChange={(event) =>
                    setEditForm((state) => ({ ...state, address: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date_of_birth">Date of birth</Label>
                <Input
                  id="date_of_birth"
                  type="date"
                  value={editForm.date_of_birth}
                  onChange={(event) =>
                    setEditForm((state) => ({ ...state, date_of_birth: event.target.value }))
                  }
                />
              </div>
            </div>
            {editError && (
              <Alert variant="destructive">
                <AlertDescription>{editError}</AlertDescription>
              </Alert>
            )}
            {editSuccess && (
              <Alert>
                <AlertDescription>{editSuccess}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              {editSuccess ? (
                <Button
                  type="button"
                  onClick={() => {
                    setEditTenant(null)
                    setEditSuccess(null)
                    setEditError(null)
                  }}
                  className="bg-[#4682B4] hover:bg-[#3a6c93]"
                >
                  Close
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={savingEdit}
                  className="bg-[#4682B4] hover:bg-[#3a6c93]"
                >
                  {savingEdit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save changes
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation modal */}
      <Dialog open={!!tenantToDelete} onOpenChange={(open) => !open && setTenantToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove tenant</DialogTitle>
            <DialogDescription>
              This action will remove the tenant account and its active lease association. It cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-900">{tenantToDelete?.full_name}</p>
            <Separator className="my-3" />
            <p>Email: {tenantToDelete?.email || '—'}</p>
            <p>Unit: {tenantToDelete?.unit_label || 'Unassigned'}</p>
          </div>
          <DialogFooter className="gap-2 sm:space-x-2">
            <Button variant="outline" onClick={() => setTenantToDelete(null)} disabled={removingTenant}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveTenant}
              disabled={removingTenant}
            >
              {removingTenant ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Remove tenant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
