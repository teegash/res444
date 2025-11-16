'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TenantsTable } from '@/components/dashboard/tenants-table'
import { Plus } from 'lucide-react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { useRouter } from 'next/navigation'

export default function TenantsPage() {
  const router = useRouter()

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
                <Button
                  onClick={() => router.push('/dashboard/tenants/new')}
                  className="gap-2 ml-4 bg-[#4682B4] hover:bg-[#4682B4]/90"
                >
                  <Plus className="w-4 h-4" />
                  Add New Tenant
                </Button>
              </div>
            </div>

            <TenantsTable />
          </div>
        </main>
      </div>
    </div>
  )
}
