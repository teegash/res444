'use client'

import { useEffect, useState } from 'react'
import { PropertiesList } from '@/components/dashboard/properties-list'
import { PropertiesGrid } from '@/components/dashboard/properties-grid'
import { PropertiesHeader } from '@/components/dashboard/properties-header'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { useRouter } from 'next/navigation'

export default function PropertiesPage() {
  const [viewType, setViewType] = useState<'grid' | 'list'>('grid')
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const router = useRouter()

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(searchTerm)
    }, 300)
    return () => window.clearTimeout(handle)
  }, [searchTerm])

  const handleAddProperty = () => {
    router.push('/dashboard/properties/new')
  }

  const handleEditProperty = (property: any) => {
    const buildingId =
      typeof property?.id === 'string'
        ? property.id.trim()
        : property?.id ?? property?.building_id ?? property?.buildingId

    if (!buildingId) {
      console.warn('[PropertiesPage] Unable to determine property id for edit action.', property)
      return
    }

    router.push(`/dashboard/properties/${buildingId}/edit`)
  }

  const resolveBuildingId = (property: any) => {
    const raw =
      property?.id ??
      property?.building_id ??
      property?.buildingId ??
      property?.apartment_building_id
    if (typeof raw === 'string') {
      return raw.trim()
    }
    if (raw === null || raw === undefined) {
      return ''
    }
    return String(raw)
  }

  const handleManageUnits = (property: any) => {
    const buildingId = resolveBuildingId(property)
    if (!buildingId) {
      console.warn('[PropertiesPage] Missing building id for manage units:', property)
      return
    }
    router.push(`/dashboard/property/${buildingId}/unit_management`)
  }

  const handleViewProperty = (propertyId: string) => {
    const normalizedId = (propertyId?.trim?.() ?? `${propertyId}`).trim()
    if (!normalizedId) {
      console.warn('[PropertiesPage] Missing property id for view:', propertyId)
      return
    }
    router.push(`/dashboard/properties/${normalizedId}`)
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
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
            />

            {viewType === 'grid' ? (
              <PropertiesGrid
                onEdit={handleEditProperty}
                onManageUnits={handleManageUnits}
                onView={handleViewProperty}
                searchTerm={debouncedSearch}
              />
            ) : (
              <PropertiesList
                onEdit={handleEditProperty}
                onManageUnits={handleManageUnits}
                onView={handleViewProperty}
                searchTerm={debouncedSearch}
              />
            )}

          </div>
        </main>
      </div>
    </div>
  )
}
