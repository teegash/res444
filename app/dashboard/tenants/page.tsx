'use client'

import { useState, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TenantsTable } from '@/components/dashboard/tenants-table'
import { AddTenantModal } from '@/components/dashboard/add-tenant-modal'
import { Plus } from 'lucide-react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { useSearchParams, useRouter } from 'next/navigation'

export default function TenantsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const searchParams = useSearchParams()
  const router = useRouter()
  const paramsString = searchParams.toString()

  const prefill = useMemo(() => {
    const params = new URLSearchParams(paramsString)
    const propertyId = params.get('propertyId')
    const propertyName = params.get('propertyName')
    const unitId = params.get('unitId')
    const unitNumber = params.get('unitNumber')
    if (propertyId || unitId) {
      return { propertyId, propertyName, unitId, unitNumber }
    }
    return null
  }, [paramsString])

  useEffect(() => {
    if (prefill) {
      setIsModalOpen(true)
    }
  }, [prefill])

  const handleModalChange = (open: boolean) => {
    setIsModalOpen(open)
    if (!open && prefill) {
      const params = new URLSearchParams(paramsString)
      params.delete('propertyId')
      params.delete('propertyName')
      params.delete('unitId')
      params.delete('unitNumber')
      const query = params.toString()
      router.replace(`/dashboard/tenants${query ? `?${query}` : ''}`)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto">
            <div className="mb-6 space-y-4">
              <h1 className="text-3xl font-bold">Tenant Management</h1>

              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Input placeholder="Search by name, email, or phone..." />
                </div>
                <Button onClick={() => setIsModalOpen(true)} className="gap-2 ml-4 bg-[#4682B4] hover:bg-[#4682B4]/90">
                  <Plus className="w-4 h-4" />
                  Add New Tenant
                </Button>
              </div>
            </div>

            <TenantsTable />
            <AddTenantModal open={isModalOpen} onOpenChange={handleModalChange} prefill={prefill} />
          </div>
        </main>
      </div>
    </div>
  )
}
