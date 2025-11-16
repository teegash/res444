'use client'

import { useEffect, useMemo, useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, MoreVertical, Copy, Phone } from 'lucide-react'
import { Separator } from '@/components/ui/separator'

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
    case 'pending':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'unassigned':
      return 'bg-slate-50 text-slate-600 border-slate-200'
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200'
  }
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

function TenantActions({
  tenant,
  onEdit,
  onSendMessage,
  onRemove,
}: {
  tenant: TenantRecord
  onEdit: (tenant: TenantRecord) => void
  onSendMessage: (tenant: TenantRecord) => void
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
        <DropdownMenuItem onClick={() => onSendMessage(tenant)}>Send Message</DropdownMenuItem>
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

export function TenantsTable({ searchQuery = '' }: TenantsTableProps) {
  const { toast } = useToast()
  const [tenants, setTenants] = useState<TenantRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshIndex, setRefreshIndex] = useState(0)

  const [messageTenant, setMessageTenant] = useState<TenantRecord | null>(null)
  const [messageContent, setMessageContent] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)

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
        setTenants(payload.data || [])
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
    }
  }, [editTenant])

  useEffect(() => {
    if (messageTenant) {
      setMessageContent('')
    }
  }, [messageTenant])

  const filteredTenants = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return tenants
    return tenants.filter((tenant) => {
      return [
        tenant.full_name,
        tenant.email,
        tenant.phone_number,
        tenant.unit_label,
        tenant.national_id,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    })
  }, [searchQuery, tenants])

  const handleCopy = (value: string, label: string) => {
    if (!value) return
    navigator.clipboard.writeText(value).then(() => {
      toast({
        title: `${label} copied`,
        description: value,
      })
    })
  }

  const handleSendMessage = async () => {
    if (!messageTenant) {
      return
    }
    if (!messageContent.trim()) {
      toast({
        title: 'Message required',
        description: 'Please enter a message before sending.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSendingMessage(true)
      const response = await fetch(`/api/tenants/${messageTenant.tenant_user_id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageContent.trim(),
          lease_id: messageTenant.lease_id,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to send message.')
      }

      toast({
        title: 'Message sent',
        description: `Delivered to ${messageTenant.full_name}'s tenant portal.`,
      })
      setMessageTenant(null)
    } catch (sendError) {
      toast({
        title: 'Unable to send message',
        description:
          sendError instanceof Error ? sendError.message : 'Please try again in a few moments.',
        variant: 'destructive',
      })
    } finally {
      setSendingMessage(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!editTenant) return
    setSavingEdit(true)
    try {
      const response = await fetch(`/api/tenants/${editTenant.tenant_user_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editForm,
          date_of_birth: editForm.date_of_birth || null,
        }),
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}))
        throw new Error(errorPayload.error || 'Failed to update tenant.')
      }

      toast({ title: 'Tenant updated', description: 'The tenant details were saved successfully.' })
      setEditTenant(null)
      setRefreshIndex((index) => index + 1)
    } catch (saveError) {
      toast({
        title: 'Update failed',
        description: saveError instanceof Error ? saveError.message : 'Unable to save changes.',
        variant: 'destructive',
      })
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

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Lease Status</TableHead>
                <TableHead>Payment Status</TableHead>
                <TableHead>Lease Start</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Fetching active tenants…
                    </div>
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
                filteredTenants.map((tenant) => (
                  <TableRow key={tenant.lease_id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          {tenant.profile_picture_url ? (
                            <AvatarImage src={tenant.profile_picture_url} alt={tenant.full_name} />
                          ) : null}
                          <AvatarFallback>{getInitials(tenant.full_name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium leading-tight">{tenant.full_name}</p>
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
                      <TenantActions
                        tenant={tenant}
                        onEdit={setEditTenant}
                        onSendMessage={setMessageTenant}
                        onRemove={setTenantToDelete}
                      />
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Send message modal */}
      <Dialog open={!!messageTenant} onOpenChange={(open) => !open && setMessageTenant(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Message {messageTenant?.full_name}</DialogTitle>
            <DialogDescription>
              Send an in-app message to the tenant. They will see it instantly in their portal and receive
              a notification.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Deliver to</Label>
              <Input value={messageTenant?.email || 'Tenant portal user'} disabled />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea
                rows={5}
                value={messageContent}
                onChange={(event) => setMessageContent(event.target.value)}
                placeholder="Share important updates, payment reminders, or welcome messages."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleSendMessage}
              disabled={sendingMessage || !messageContent.trim()}
              className="bg-[#4682B4] hover:bg-[#3a6c93]"
            >
              {sendingMessage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit tenant modal */}
      <Dialog open={!!editTenant} onOpenChange={(open) => !open && setEditTenant(null)}>
        <DialogContent className="max-w-2xl">
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
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={editForm.email}
                onChange={(event) => setEditForm((state) => ({ ...state, email: event.target.value }))}
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
          <DialogFooter>
            <Button
              onClick={handleSaveEdit}
              disabled={savingEdit}
              className="bg-[#4682B4] hover:bg-[#3a6c93]"
            >
              {savingEdit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
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
