'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Pencil, Save, X, Plus, ArrowLeft, UserPlus } from 'lucide-react'

interface UnitRecord {
  id: string
  unit_number: string
  floor: number | null
  number_of_bedrooms: number | null
  number_of_bathrooms: number | null
  size_sqft: number | null
  status: 'vacant' | 'occupied' | 'maintenance' | null
}

interface BulkLogRecord {
  id: string
  bulk_group_id: string
  units_created: number
  created_by: string
  created_at: string
}

interface UnitFormState {
  unit_number: string
  floor: string
  bedrooms: string
  bathrooms: string
  size_sqft: string
  status: 'vacant' | 'occupied' | 'maintenance'
}

const STATUS_OPTIONS: UnitFormState['status'][] = ['vacant', 'occupied', 'maintenance']
const FLOOR_NONE_VALUE = 'none'

const FLOOR_OPTIONS = Array.from({ length: 33 }, (_, index) => index - 2) // -2 (Basement 2) up to 30th floor

const formatFloorLabel = (value: number) => {
  if (value === 0) return 'Ground (0)'
  if (value === -1) return 'Basement (-1)'
  if (value === -2) return 'Basement (-2)'
  if (value === 1) return '1st Floor'
  if (value === 2) return '2nd Floor'
  if (value === 3) return '3rd Floor'
  return `${value}th Floor`
}

const expandUnitEntries = (entries: string[]) => {
  const expanded: string[] = []

  for (const entry of entries) {
    const rangeMatch = entry.match(/^(.+?)(\d+)\s*(?:\.{2}|-)\s*(.+?)(\d+)$/)

    if (rangeMatch) {
      const [, prefixA, startDigits, prefixB, endDigits] = rangeMatch
      if (prefixA.trim() !== prefixB.trim()) {
        return { units: [], error: 'Range prefixes must match (e.g., A-101..A-110).' }
      }

      const start = Number(startDigits)
      const end = Number(endDigits)
      if (Number.isNaN(start) || Number.isNaN(end)) {
        return { units: [], error: 'Range boundaries must be numbers (e.g., 101..110).' }
      }

      const step = start <= end ? 1 : -1
      const pad = Math.max(startDigits.length, endDigits.length)
      for (let current = start; step > 0 ? current <= end : current >= end; current += step) {
        expanded.push(`${prefixA}${String(current).padStart(pad, '0')}`)
      }
    } else {
      expanded.push(entry)
    }
  }

  return { units: expanded }
}

const defaultUnitForm: UnitFormState = {
  unit_number: '',
  floor: '',
  bedrooms: '',
  bathrooms: '',
  size_sqft: '',
  status: 'vacant',
}

const statusBadgeMap: Record<string, string> = {
  occupied: 'px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700',
  vacant: 'px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700',
  maintenance: 'px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700',
}

const cnStatus = (status: string | null | undefined) =>
  statusBadgeMap[(status || '').toLowerCase()] ||
  'px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700'

export default function UnitManagementPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const rawParam = params?.id
  const buildingId = Array.isArray(rawParam)
    ? decodeURIComponent(rawParam[0] || '').trim()
    : (rawParam ? decodeURIComponent(rawParam).trim() : '')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<{
    building: {
      id: string
      name: string
      location: string
      total_units: number
      description: string | null
    }
    units: UnitRecord[]
    bulk_logs: BulkLogRecord[]
  } | null>(null)

  const [editingUnits, setEditingUnits] = useState<Record<string, UnitFormState>>({})
  const [savingUnitId, setSavingUnitId] = useState<string | null>(null)
  const [newUnit, setNewUnit] = useState<UnitFormState>(defaultUnitForm)
  const [addingUnit, setAddingUnit] = useState(false)
  const [bulkInput, setBulkInput] = useState('')
  const [bulkDefaults, setBulkDefaults] = useState<UnitFormState>(defaultUnitForm)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [bulkAdding, setBulkAdding] = useState(false)

  const fetchData = useCallback(async () => {
    if (!buildingId) {
      setError('Building not found.')
      setData(null)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const response = await fetch(
        `/api/properties/${buildingId}/units?buildingId=${encodeURIComponent(buildingId)}`,
        {
          credentials: 'include',
          cache: 'no-store',
        }
      )
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load units.')
      }
      setData(result.data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load units.'
      setError(message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [buildingId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const units = data?.units || []
  const building = data?.building
  const totalUnits = building?.total_units || 0
  const occupiedUnits = units.filter((u) => (u.status || '').toLowerCase() === 'occupied').length
  const vacantUnits = units.filter((u) => (u.status || '').toLowerCase() === 'vacant').length
  const maintenanceUnits = units.filter((u) => (u.status || '').toLowerCase() === 'maintenance').length
  const remainingCapacity = Math.max(0, totalUnits - units.length)

  const convertUnitToForm = (unit: UnitRecord): UnitFormState => ({
    unit_number: unit.unit_number,
    floor: unit.floor === null || unit.floor === undefined ? '' : unit.floor.toString(),
    bedrooms: unit.number_of_bedrooms?.toString() || '',
    bathrooms: unit.number_of_bathrooms?.toString() || '',
    size_sqft: unit.size_sqft?.toString() || '',
    status: (unit.status as UnitFormState['status']) || 'vacant',
  })

  const startEditing = (unit: UnitRecord) => {
    setEditingUnits((prev) => ({
      ...prev,
      [unit.id]: convertUnitToForm(unit),
    }))
  }

  const cancelEditing = (unitId: string) => {
    setEditingUnits((prev) => {
      const copy = { ...prev }
      delete copy[unitId]
      return copy
    })
  }

  const handleEditChange = (unitId: string, field: keyof UnitFormState, value: string) => {
    setEditingUnits((prev) => ({
      ...prev,
      [unitId]: {
        ...prev[unitId],
        [field]: value,
      },
    }))
  }

  const saveUnit = async (unitId: string) => {
    const payload = editingUnits[unitId]
    if (!payload || !buildingId) return
    try {
      setSavingUnitId(unitId)
      const response = await fetch(
        `/api/properties/${buildingId}/units?buildingId=${encodeURIComponent(buildingId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            building_id: buildingId,
            unit_id: unitId,
            updates: {
              unit_number: payload.unit_number,
              floor: payload.floor,
              number_of_bedrooms: payload.bedrooms,
              number_of_bathrooms: payload.bathrooms,
              size_sqft: payload.size_sqft,
              status: payload.status,
            },
          }),
        }
      )
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update unit.')
      }
      cancelEditing(unitId)
      fetchData()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update unit.'
      setError(message)
    } finally {
      setSavingUnitId(null)
    }
  }

  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!buildingId) return
    setError(null)

    if (remainingCapacity <= 0) {
      setError('This building is already at its maximum unit capacity.')
      return
    }

    if (!newUnit.unit_number.trim()) {
      setError('Unit number is required.')
      return
    }

    try {
      setAddingUnit(true)
      const response = await fetch(
        `/api/properties/${buildingId}/units?buildingId=${encodeURIComponent(buildingId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            building_id: buildingId,
            units: [
              {
                unit_number: newUnit.unit_number,
                floor: newUnit.floor,
                number_of_bedrooms: newUnit.bedrooms,
                number_of_bathrooms: newUnit.bathrooms,
                size_sqft: newUnit.size_sqft,
                status: newUnit.status,
              },
            ],
          }),
        }
      )
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to add unit.')
      }
      setNewUnit(defaultUnitForm)
      fetchData()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add unit.'
      setError(message)
    } finally {
      setAddingUnit(false)
    }
  }

  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!buildingId) return
    setBulkError(null)

    const rawEntries = bulkInput
      .split(/\n|,/)
      .map((value) => value.trim())
      .filter(Boolean)

    if (rawEntries.length === 0) {
      setBulkError('Please enter at least one unit number.')
      return
    }

    const { units: expandedUnits, error: rangeError } = expandUnitEntries(rawEntries)

    if (rangeError) {
      setBulkError(rangeError)
      return
    }

    if (expandedUnits.length > remainingCapacity) {
      setBulkError(`You can only add ${remainingCapacity} more unit${remainingCapacity === 1 ? '' : 's'}.`)
      return
    }

    try {
      setBulkAdding(true)
      const response = await fetch(
        `/api/properties/${buildingId}/units?buildingId=${encodeURIComponent(buildingId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            building_id: buildingId,
            units: expandedUnits.map((unitNumber) => ({
              unit_number: unitNumber,
              floor: bulkDefaults.floor,
              number_of_bedrooms: bulkDefaults.bedrooms,
              number_of_bathrooms: bulkDefaults.bathrooms,
              size_sqft: bulkDefaults.size_sqft,
              status: bulkDefaults.status,
            })),
          }),
        }
      )
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to add units.')
      }
      setBulkInput('')
      setBulkDefaults(defaultUnitForm)
      fetchData()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to bulk add units.'
      setBulkError(message)
    } finally {
      setBulkAdding(false)
    }
  }

  const handleAssignTenant = (unit: UnitRecord) => {
    if (!buildingId) return
    const params = new URLSearchParams({
      propertyId: buildingId,
      unitId: unit.id,
    })
    if (building?.name) {
      params.set('propertyName', building.name)
    }
    if (unit.unit_number) {
      params.set('unitNumber', unit.unit_number)
    }
    router.push(`/dashboard/tenants?${params.toString()}`)
  }

  const sortedLogs = useMemo(() => data?.bulk_logs || [], [data?.bulk_logs])

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/properties')}>
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <p className="text-xs text-gray-500">Building</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {building?.name || 'Property Units'}
                  </p>
                  {building?.location && (
                    <p className="text-sm text-gray-500">{building.location}</p>
                  )}
                </div>
              </div>
              <div className="text-sm text-gray-600">
                Total Capacity: <span className="font-semibold">{totalUnits}</span> units
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="p-6">
                <p className="text-sm text-gray-600 mb-1">Total Units</p>
                <p className="text-3xl font-bold">{totalUnits}</p>
              </Card>
              <Card className="p-6">
                <p className="text-sm text-gray-600 mb-1">Occupied</p>
                <p className="text-3xl font-bold text-green-600">{occupiedUnits}</p>
              </Card>
              <Card className="p-6">
                <p className="text-sm text-gray-600 mb-1">Vacant</p>
                <p className="text-3xl font-bold text-orange-500">{vacantUnits}</p>
              </Card>
              <Card className="p-6">
                <p className="text-sm text-gray-600 mb-1">Maintenance</p>
                <p className="text-3xl font-bold text-red-500">{maintenanceUnits}</p>
              </Card>
            </div>

            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">Existing Units</h2>
              {loading && !data ? (
                <div className="flex items-center gap-3 text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading units...
                </div>
              ) : units.length === 0 ? (
                <p className="text-gray-500">No units have been added yet.</p>
              ) : (
                <div className="space-y-3">
                  {units.map((unit) => {
                    const formState = editingUnits[unit.id]
                    const isEditing = !!formState
                    const displayState = formState || convertUnitToForm(unit)

                    return (
                      <div
                        key={unit.id}
                        className="rounded-lg border border-gray-200 p-4 flex flex-col md:flex-row gap-4"
                      >
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-4">
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Unit Number</p>
                            {isEditing ? (
                              <Input
                                value={displayState.unit_number}
                                onChange={(e) => handleEditChange(unit.id, 'unit_number', e.target.value)}
                              />
                            ) : (
                              <p className="font-semibold">{unit.unit_number}</p>
                            )}
                          </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Floor</p>
                              {isEditing ? (
                                <Select
                                value={displayState.floor ? displayState.floor : FLOOR_NONE_VALUE}
                                onValueChange={(value) =>
                                  handleEditChange(
                                    unit.id,
                                    'floor',
                                    value === FLOOR_NONE_VALUE ? '' : value
                                  )
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select floor" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={FLOOR_NONE_VALUE}>Not set</SelectItem>
                                  {FLOOR_OPTIONS.map((floor) => (
                                    <SelectItem key={floor} value={String(floor)}>
                                      {formatFloorLabel(floor)}
                                    </SelectItem>
                                  ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <p className="font-medium">
                                  {unit.floor === null || unit.floor === undefined
                                    ? '-'
                                    : formatFloorLabel(unit.floor)}
                                </p>
                              )}
                            </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Bedrooms / Bathrooms</p>
                            {isEditing ? (
                              <div className="flex gap-2">
                                <Input
                                  value={displayState.bedrooms}
                                  placeholder="Bedrooms"
                                  onChange={(e) => handleEditChange(unit.id, 'bedrooms', e.target.value)}
                                />
                                <Input
                                  value={displayState.bathrooms}
                                  placeholder="Bathrooms"
                                  onChange={(e) => handleEditChange(unit.id, 'bathrooms', e.target.value)}
                                />
                              </div>
                            ) : (
                              <p className="font-medium">
                                {unit.number_of_bedrooms ?? '-'} BR / {unit.number_of_bathrooms ?? '-'} BA
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Size (sq ft)</p>
                            {isEditing ? (
                              <Input
                                value={displayState.size_sqft}
                                onChange={(e) => handleEditChange(unit.id, 'size_sqft', e.target.value)}
                              />
                            ) : (
                              <p className="font-medium">{unit.size_sqft ?? '-'}</p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Status</p>
                            {isEditing ? (
                              <Select
                                value={displayState.status}
                                onValueChange={(value: UnitFormState['status']) =>
                                  handleEditChange(unit.id, 'status', value)
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                  {STATUS_OPTIONS.map((status) => (
                                    <SelectItem key={status} value={status}>
                                      {status.charAt(0).toUpperCase() + status.slice(1)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <p className={cnStatus(unit.status)}>
                                {unit.status?.charAt(0).toUpperCase() + unit.status?.slice(1)}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 justify-end">
                          {isEditing ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => cancelEditing(unit.id)}
                                disabled={savingUnitId === unit.id}
                              >
                                <X className="w-4 h-4 mr-1" /> Cancel
                              </Button>
                              <Button
                                size="sm"
                                className="bg-[#4682B4] hover:bg-[#3b6a91]"
                                onClick={() => saveUnit(unit.id)}
                                disabled={savingUnitId === unit.id}
                              >
                                {savingUnitId === unit.id ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving
                                  </>
                                ) : (
                                  <>
                                    <Save className="w-4 h-4 mr-1" /> Save
                                  </>
                                )}
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => startEditing(unit)}
                                className="gap-2"
                              >
                                <Pencil className="w-4 h-4" /> Edit
                              </Button>
                              {(unit.status || '').toLowerCase() === 'vacant' && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleAssignTenant(unit)}
                                  className="gap-2"
                                >
                                  <UserPlus className="w-4 h-4" /> Assign Tenant
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold">Add Single Unit</h2>
                  <p className="text-sm text-gray-500">
                    Remaining capacity: {remainingCapacity} unit{remainingCapacity === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
              <form className="grid gap-4 md:grid-cols-2" onSubmit={handleAddUnit}>
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">Unit Number *</p>
                  <Input
                    value={newUnit.unit_number}
                    onChange={(e) => setNewUnit((prev) => ({ ...prev, unit_number: e.target.value }))}
                    placeholder="A-101"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">Floor</p>
                  <Select
                    value={newUnit.floor ? newUnit.floor : FLOOR_NONE_VALUE}
                    onValueChange={(value) =>
                      setNewUnit((prev) => ({ ...prev, floor: value === FLOOR_NONE_VALUE ? '' : value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select floor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FLOOR_NONE_VALUE}>Not set</SelectItem>
                      {FLOOR_OPTIONS.map((floor) => (
                        <SelectItem key={floor} value={String(floor)}>
                          {formatFloorLabel(floor)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">Bedrooms</p>
                  <Input
                    value={newUnit.bedrooms}
                    onChange={(e) => setNewUnit((prev) => ({ ...prev, bedrooms: e.target.value }))}
                    placeholder="2"
                    type="number"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">Bathrooms</p>
                  <Input
                    value={newUnit.bathrooms}
                    onChange={(e) => setNewUnit((prev) => ({ ...prev, bathrooms: e.target.value }))}
                    placeholder="1"
                    type="number"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">Size (sq ft)</p>
                  <Input
                    value={newUnit.size_sqft}
                    onChange={(e) => setNewUnit((prev) => ({ ...prev, size_sqft: e.target.value }))}
                    placeholder="850"
                    type="number"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">Status</p>
                  <Select
                    value={newUnit.status}
                    onValueChange={(value: UnitFormState['status']) =>
                      setNewUnit((prev) => ({ ...prev, status: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <Button
                    type="submit"
                    className="gap-2 bg-[#4682B4] hover:bg-[#375f84]"
                    disabled={addingUnit}
                  >
                    {addingUnit ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" /> Add Unit
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold">Bulk Add Units</h2>
                  <p className="text-sm text-gray-500">
                    Paste unit numbers separated by commas or line breaks. Use ranges like{' '}
                    <span className="font-medium">A-101..A-110</span> to auto-generate sequences.
                  </p>
                </div>
              </div>
              <form className="space-y-4" onSubmit={handleBulkAdd}>
                <Textarea
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  rows={4}
                  placeholder={'A-101\nA-102\nA-103'}
                />
                <div className="grid gap-4 md:grid-cols-4">
                  <Select
                    value={bulkDefaults.floor ? bulkDefaults.floor : FLOOR_NONE_VALUE}
                    onValueChange={(value) =>
                      setBulkDefaults((prev) => ({ ...prev, floor: value === FLOOR_NONE_VALUE ? '' : value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Floor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FLOOR_NONE_VALUE}>Not set</SelectItem>
                      {FLOOR_OPTIONS.map((floor) => (
                        <SelectItem key={floor} value={String(floor)}>
                          {formatFloorLabel(floor)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Bedrooms"
                    value={bulkDefaults.bedrooms}
                    onChange={(e) => setBulkDefaults((prev) => ({ ...prev, bedrooms: e.target.value }))}
                  />
                  <Input
                    placeholder="Bathrooms"
                    value={bulkDefaults.bathrooms}
                    onChange={(e) => setBulkDefaults((prev) => ({ ...prev, bathrooms: e.target.value }))}
                  />
                  <Input
                    placeholder="Size (sq ft)"
                    value={bulkDefaults.size_sqft}
                    onChange={(e) => setBulkDefaults((prev) => ({ ...prev, size_sqft: e.target.value }))}
                  />
                </div>
                <div className="max-w-xs">
                  <Select
                    value={bulkDefaults.status}
                    onValueChange={(value: UnitFormState['status']) =>
                      setBulkDefaults((prev) => ({ ...prev, status: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {bulkError && (
                  <p className="text-sm text-red-600">{bulkError}</p>
                )}
                <div className="flex justify-end">
                  <Button type="submit" variant="outline" className="gap-2" disabled={bulkAdding}>
                    {bulkAdding ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Adding Units...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" /> Bulk Add Units
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Card>

            {sortedLogs.length > 0 && (
              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4">Bulk Upload History</h2>
                <div className="space-y-3">
                  {sortedLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between rounded-lg border border-gray-200 p-4"
                    >
                      <div>
                        <p className="font-semibold">{log.units_created} units</p>
                        <p className="text-sm text-gray-500">Bulk group: {log.bulk_group_id}</p>
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(log.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
