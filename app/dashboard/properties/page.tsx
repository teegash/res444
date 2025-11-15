'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PropertiesList } from '@/components/dashboard/properties-list'
import { PropertiesGrid } from '@/components/dashboard/properties-grid'
import { PropertiesHeader } from '@/components/dashboard/properties-header'
import { EditPropertyModal } from '@/components/dashboard/edit-property-modal'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { useRouter } from 'next/navigation'

export default function PropertiesPage() {
  const [viewType, setViewType] = useState<'grid' | 'list'>('grid')
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState<any>(null)
  const router = useRouter()

  const handleAddProperty = () => {
    router.push('/dashboard/properties/new')
  }

  const handleEditProperty = (property: any) => {
    setSelectedProperty(property)
    setIsEditModalOpen(true)
  }

  const handleManageUnits = (property: any) => {
    if (property?.id) {
      router.push(`/dashboard/manager/properties/${property.id}/units`)
    }
  }

  const handleViewProperty = (propertyId: number) => {
    router.push(`/dashboard/properties/${propertyId}`)
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Properties Management</h1>

            <PropertiesHeader
              viewType={viewType}
              setViewType={setViewType}
              onAddProperty={handleAddProperty}
            />

            {viewType === 'grid' ? (
              <PropertiesGrid onEdit={handleEditProperty} onManageUnits={handleManageUnits} onView={handleViewProperty} />
            ) : (
              <PropertiesList onEdit={handleEditProperty} onManageUnits={handleManageUnits} onView={handleViewProperty} />
            )}

            <EditPropertyModal
              open={isEditModalOpen}
              onOpenChange={setIsEditModalOpen}
              property={selectedProperty}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
