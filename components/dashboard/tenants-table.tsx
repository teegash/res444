'use client'

import { useState } from 'react'
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { MoreVertical, Copy, Phone, MessageSquare } from 'lucide-react'

const tenants = [
  {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+254712345678',
    unit: 'Unit 101 - Alpha Complex',
    leaseStatus: 'Active',
    leaseEndDate: '2025-06-15',
    paymentStatus: 'Paid',
    joined: '2023-06-15',
    initials: 'JD',
  },
  {
    id: 2,
    name: 'Jane Smith',
    email: 'jane@example.com',
    phone: '+254723456789',
    unit: 'Unit 205 - Beta Towers',
    leaseStatus: 'Active',
    leaseEndDate: '2025-07-20',
    paymentStatus: 'Paid',
    joined: '2023-07-20',
    initials: 'JS',
  },
  {
    id: 3,
    name: 'Bob Wilson',
    email: 'bob@example.com',
    phone: '+254734567890',
    unit: 'Unit 312 - Gamma Heights',
    leaseStatus: 'Active',
    leaseEndDate: '2025-08-10',
    paymentStatus: 'Overdue',
    joined: '2023-08-10',
    initials: 'BW',
  },
]

interface TenantActionProps {
  tenant: typeof tenants[0]
  onViewProfile: (tenant: typeof tenants[0]) => void
  onEdit: (tenant: typeof tenants[0]) => void
  onSendMessage: (tenant: typeof tenants[0]) => void
  onSuspend: (tenant: typeof tenants[0]) => void
  onRemove: (tenant: typeof tenants[0]) => void
}

function TenantActions({
  tenant,
  onViewProfile,
  onEdit,
  onSendMessage,
  onSuspend,
  onRemove,
}: TenantActionProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onViewProfile(tenant)}>
          View Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(tenant)}>
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSendMessage(tenant)} className="gap-2">
          <MessageSquare className="w-4 h-4" />
          Send Message
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSuspend(tenant)}>
          Suspend
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onRemove(tenant)} className="text-destructive">
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TenantsTable() {
  const [selectedTenant, setSelectedTenant] = useState<typeof tenants[0] | null>(null)

  const handleViewProfile = (tenant: typeof tenants[0]) => {
    console.log('[v0] Viewing profile for:', tenant.name)
    setSelectedTenant(tenant)
  }

  const handleEdit = (tenant: typeof tenants[0]) => {
    console.log('[v0] Editing tenant:', tenant.name)
  }

  const handleSendMessage = (tenant: typeof tenants[0]) => {
    console.log('[v0] Sending message to:', tenant.name)
  }

  const handleSuspend = (tenant: typeof tenants[0]) => {
    console.log('[v0] Suspending tenant:', tenant.name)
  }

  const handleRemove = (tenant: typeof tenants[0]) => {
    console.log('[v0] Removing tenant:', tenant.name)
  }

  return (
    <TooltipProvider>
      <div className="border border-border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Unit/Building</TableHead>
              <TableHead>Lease Status</TableHead>
              <TableHead>Payment Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((tenant) => (
              <TableRow key={tenant.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback>{tenant.initials}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{tenant.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{tenant.email}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{tenant.phone}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <Phone className="w-3 h-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{tenant.unit}</TableCell>
                <TableCell>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 cursor-help">
                        {tenant.leaseStatus}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Lease ends: {new Date(tenant.leaseEndDate).toLocaleDateString()}</p>
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={tenant.paymentStatus === 'Paid' ? 'default' : 'destructive'}
                  >
                    {tenant.paymentStatus}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{tenant.joined}</TableCell>
                <TableCell>
                  <TenantActions
                    tenant={tenant}
                    onViewProfile={handleViewProfile}
                    onEdit={handleEdit}
                    onSendMessage={handleSendMessage}
                    onSuspend={handleSuspend}
                    onRemove={handleRemove}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  )
}
