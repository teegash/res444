'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TenantsTable } from '@/components/dashboard/tenants-table'
import { LayoutGrid, Plus, Rows4 } from 'lucide-react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { useRouter } from 'next/navigation'

export default function TenantArchivePage() {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
  const [viewModeLocked, setViewModeLocked] = useState(false)

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

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto">
            <div className="mb-6 space-y-4">
              <h1 className="text-3xl font-bold">Tenant Archive</h1>

              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative w-full md:flex-[0_0_50%]">
                  <Input
                    placeholder="Search by name, email, phone, or unit..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </div>
                <div className="flex items-center gap-3 justify-end w-full md:w-auto flex-wrap">
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
                  <Button
                    onClick={() => router.push('/dashboard/tenants/new')}
                    className="gap-2 bg-[#4682B4] hover:bg-[#4682B4]/90"
                  >
                    <Plus className="w-4 h-4" />
                    Add New Tenant
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => router.push('/dashboard/tenants/bulk-import')}
                  >
                    Bulk Import
                  </Button>
                </div>
              </div>
            </div>

            <TenantsTable
              searchQuery={searchTerm}
              viewMode={viewMode}
              propertyId={null}
              archiveMode={true}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
