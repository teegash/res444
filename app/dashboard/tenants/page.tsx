'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TenantsTable } from '@/components/dashboard/tenants-table'
import { LayoutGrid, Plus, Rows4 } from 'lucide-react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function TenantsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
  const [viewModeLocked, setViewModeLocked] = useState(false)
  const [highlightFilter, setHighlightFilter] = useState<'all' | 'rating_red'>('all')
  const [leaseStatusFilter, setLeaseStatusFilter] = useState<
    'all' | 'valid' | 'active' | 'renewed' | 'pending' | 'expired' | 'unassigned'
  >('all')
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'unpaid'>('all')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(max-width: 767px)')
    const applyDefault = () => {
      if (viewModeLocked) return
      setViewMode(media.matches ? 'grid' : 'list')
    }
    applyDefault()
    media.addEventListener('change', applyDefault)
    return () => media.removeEventListener('change', applyDefault)
  }, [viewModeLocked])

  const propertyScope =
    (user?.user_metadata as any)?.property_id ||
    (user?.user_metadata as any)?.building_id ||
    (user as any)?.property_id ||
    null

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto">
            <div className="mb-6 space-y-4">
              <h1 className="text-3xl font-bold">Tenant Management</h1>

              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative w-full md:flex-[0_0_50%]">
                  <Input
                    placeholder="Search by name, email, phone, or unit..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </div>
                <div className="flex items-center gap-3 justify-end w-full md:w-auto">
                  <div className="inline-flex rounded-full border bg-white p-1 shadow-sm">
                    <Button
                      variant={viewMode === 'grid' ? 'default' : 'ghost'}
                      size="icon"
                      className="rounded-full"
                      onClick={() => {
                        setViewMode('grid')
                        setViewModeLocked(true)
                      }}
                      aria-label="Grid view"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'list' ? 'default' : 'ghost'}
                      size="icon"
                      className="rounded-full"
                      onClick={() => {
                        setViewMode('list')
                        setViewModeLocked(true)
                      }}
                      aria-label="List view"
                    >
                      <Rows4 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={highlightFilter} onValueChange={(value) => setHighlightFilter(value as any)}>
                      <SelectTrigger className="h-9 w-[160px]">
                        <SelectValue placeholder="Highlight" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All highlights</SelectItem>
                        <SelectItem value="rating_red">Red rating</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={leaseStatusFilter} onValueChange={(value) => setLeaseStatusFilter(value as any)}>
                      <SelectTrigger className="h-9 w-[170px]">
                        <SelectValue placeholder="Lease status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All lease statuses</SelectItem>
                        <SelectItem value="valid">Valid</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="renewed">Renewed</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={paymentFilter} onValueChange={(value) => setPaymentFilter(value as any)}>
                      <SelectTrigger className="h-9 w-[150px]">
                        <SelectValue placeholder="Payment" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All payments</SelectItem>
                        <SelectItem value="unpaid">Unpaid rent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={() => router.push('/dashboard/tenants/new')}
                    className="gap-2 bg-[#4682B4] hover:bg-[#4682B4]/90"
                  >
                    <Plus className="w-4 h-4" />
                    Add New Tenant
                  </Button>
                </div>
              </div>
            </div>

            <TenantsTable
              searchQuery={searchTerm}
              viewMode={viewMode}
              propertyId={propertyScope}
              highlightFilter={highlightFilter}
              leaseStatusFilter={leaseStatusFilter}
              paymentFilter={paymentFilter}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
