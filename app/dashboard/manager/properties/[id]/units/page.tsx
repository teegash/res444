'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Building2,
  Loader2,
  Pencil,
  Save,
  X,
  Plus,
  ArrowLeft,
} from 'lucide-react'

type UnitRecord = {
  id: string
  unit_number: string
  floor: number | null
  number_of_bedrooms: number | null
  number_of_bathrooms: number | null
  size_sqft: number | null
  status: 'vacant' | 'occupied' | 'maintenance' | null
}

type UnitFormState = {
  unit_number: string
  floor: string
  bedrooms: string
  bathrooms: string
  size_sqft: string
  status: 'vacant' | 'occupied' | 'maintenance'
}

const STATUS_OPTIONS: UnitFormState['status'][] = ['vacant', 'occupied', 'maintenance']

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

export default function PropertyUnitsPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const buildingId = params?.id as string

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
    bulk_logs: Array<{
      id: string
      bulk_group_id: string
      units_created: number
      created_by: string
      created_at: string
    }>
  } | null>(null)

  const [editingUnits, setEditingUnits] = useState<Record<string, UnitFormState>>({})
  const [newUnit, setNewUnit] = useState<UnitFormState>(defaultUnitForm)
  const [bulkInput, setBulkInput] = useState('')
  const [bulkDefaults, setBulkDefaults] = useState<UnitFormState>(defaultUnitForm)
  const [savingUnitId, setSavingUnitId] = useState<string | null>(null)
  const [addingUnit, setAddingUnit] = useState(false)
  const [bulkAdding, setBulkAdding] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!buildingId) return
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/properties/${buildingId}/units`, {
        credentials: 'include',
        cache: 'no-store',
      })
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
  const totalUnits = data?.building?.total_units || 0
  const occupiedUnits = units.filter((u) => (u.status || '').toLowerCase() === 'occupied').length
  const vacantUnits = units.filter((u) => (u.status || '').toLowerCase() === 'vacant').length
  const maintenanceUnits = units.filter((u) => (u.status || '').toLowerCase() === 'maintenance').length
  const remainingSlots = Math.max(0, totalUnits - units.length)

  const convertUnitToForm = (unit: UnitRecord): UnitFormState => ({
    unit_number: unit.unit_number,
    floor: unit.floor?.toString() || '',
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
      const updated = { ...prev }
      delete updated[unitId]
      return updated
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
    if (!payload) return
    try {
      setSavingUnitId(unitId)
      const response = await fetch(`/api/properties/${buildingId}/units`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
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
      })
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
    if (remainingSlots <= 0) {
      setError('This building is already at its maximum unit capacity.')
      return
    }
    if (!newUnit.unit_number.trim()) {
      setError('Unit number is required.')
      return
    }
    try {
      setAddingUnit(true)
      const response = await fetch(`/api/properties/${buildingId}/units`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
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
      })
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
    setBulkError(null)
    const unitNumbers = bulkInput
      .split(/\n|,/)
      .map((line) => line.trim())
      .filter(Boolean)
    if (unitNumbers.length === 0) {
      setBulkError('Please enter at least one unit number.')
      return
    }
    if (unitNumbers.length > remainingSlots) {
      setBulkError(`You can only add ${remainingSlots} more unit${remainingSlots === 1 ? '' : 's'}.`)
      return
    }
    try {
      setBulkAdding(true)
      const unitsPayload = unitNumbers.map((unitNumber) => ({
        unit_number: unitNumber,
        floor: bulkDefaults.floor,
        number_of_bedrooms: bulkDefaults.bedrooms,
        number_of_bathrooms: bulkDefaults.bathrooms,
        size_sqft: bulkDefaults.size_sqft,
        status: bulkDefaults.status,
      }))
      const response = await fetch(`/api/properties/${buildingId}/units`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ units: unitsPayload }),
      })
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

  const sortedLogs = useMemo(() => data?.bulk_logs || [], [data?.bulk_logs])

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/dashboard/manager/properties/${buildingId}`)}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-[#4682B4]" />
            <div>
              <p className="text-xs text-gray-500">Building</p>
              <p className="text-lg font-semibold text-gray-900">
                {data?.building?.name || 'Property Units'}
              </p>
            </div>
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
          <p className="text-sm text-gray-600 mb-1">Remaining Capacity</p>
          <p className="text-3xl font-bold text-[#4682B4]">{remainingSlots}</p>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Existing Units</h2>
        <div className="space-y-4">
          {loading ? (
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
                            onChange={(e) =>
                              handleEditChange(unit.id, 'unit_number', e.target.value)
                            }
                          />
                        ) : (
                          <p className="font-semibold">{unit.unit_number}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Floor</p>
                        {isEditing ? (
                          <Input
                            value={displayState.floor}
                            onChange={(e) => handleEditChange(unit.id, 'floor', e.target.value)}
                          />
                        ) : (
                          <p className="font-medium">{unit.floor ?? '-'}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Bedrooms / Bathrooms</p>
                        {isEditing ? (
                          <div className="flex gap-2">
                            <Input
                              value={displayState.bedrooms}
                              placeholder="Bedrooms"
                              onChange={(e) =>
                                handleEditChange(unit.id, 'bedrooms', e.target.value)
                              }
                            />
                            <Input
                              value={displayState.bathrooms}
                              placeholder="Bathrooms"
                              onChange={(e) =>
                                handleEditChange(unit.id, 'bathrooms', e.target.value)
                              }
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
                            onChange={(e) =>
                              handleEditChange(unit.id, 'size_sqft', e.target.value)
                            }
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
                          <p
                            className={cnStatus(unit.status)}
                          >
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
                            <X className="w-4 h-4 mr-1" />
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            className="bg-[#4682B4] hover:bg-[#375f84]"
                            onClick={() => saveUnit(unit.id)}
                            disabled={savingUnitId === unit.id}
                          >
                            {savingUnitId === unit.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Save className="w-4 h-4 mr-1" />
                            )}
                            Save
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => startEditing(unit)}>
                          <Pencil className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Add Single Unit</h2>
        <p className="text-sm text-gray-500 mb-4">
          Remaining capacity: <span className="font-semibold">{remainingSlots}</span> unit
          {remainingSlots === 1 ? '' : 's'}
        </p>
        <form onSubmit={handleAddUnit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Unit Number *</p>
              <Input
                value={newUnit.unit_number}
                onChange={(e) => setNewUnit((prev) => ({ ...prev, unit_number: e.target.value }))}
                placeholder="A-101"
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Floor</p>
              <Input
                value={newUnit.floor}
                onChange={(e) => setNewUnit((prev) => ({ ...prev, floor: e.target.value }))}
                placeholder="1"
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Size (sq ft)</p>
              <Input
                value={newUnit.size_sqft}
                onChange={(e) => setNewUnit((prev) => ({ ...prev, size_sqft: e.target.value }))}
                placeholder="850"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Bedrooms</p>
              <Input
                value={newUnit.bedrooms}
                onChange={(e) => setNewUnit((prev) => ({ ...prev, bedrooms: e.target.value }))}
                placeholder="2"
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Bathrooms</p>
              <Input
                value={newUnit.bathrooms}
                onChange={(e) => setNewUnit((prev) => ({ ...prev, bathrooms: e.target.value }))}
                placeholder="1"
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Status</p>
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
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              className="bg-[#4682B4] hover:bg-[#375f84]"
              disabled={addingUnit || remainingSlots <= 0}
            >
              {addingUnit ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Unit
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Bulk Add Units</h2>
        <p className="text-sm text-gray-500 mb-4">
          Enter unit numbers separated by commas or line breaks. Defaults will be applied to each
          unit.
        </p>
        <form onSubmit={handleBulkAdd} className="space-y-4">
          <Textarea
            value={bulkInput}
            onChange={(e) => setBulkInput(e.target.value)}
            rows={5}
            placeholder={'A-201\nA-202\nA-203'}
          />
          {bulkError && <p className="text-sm text-red-600">{bulkError}</p>}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Default Floor</p>
              <Input
                value={bulkDefaults.floor}
                onChange={(e) => setBulkDefaults((prev) => ({ ...prev, floor: e.target.value }))}
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Bedrooms</p>
              <Input
                value={bulkDefaults.bedrooms}
                onChange={(e) => setBulkDefaults((prev) => ({ ...prev, bedrooms: e.target.value }))}
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Bathrooms</p>
              <Input
                value={bulkDefaults.bathrooms}
                onChange={(e) =>
                  setBulkDefaults((prev) => ({ ...prev, bathrooms: e.target.value }))
                }
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Size (sq ft)</p>
              <Input
                value={bulkDefaults.size_sqft}
                onChange={(e) =>
                  setBulkDefaults((prev) => ({ ...prev, size_sqft: e.target.value }))
                }
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Status</p>
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
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              variant="outline"
              disabled={bulkAdding || remainingSlots <= 0}
            >
              {bulkAdding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Units
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Bulk Creation History</h2>
        {sortedLogs.length === 0 ? (
          <p className="text-gray-500">No bulk creation activity recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {sortedLogs.map((log) => (
              <div
                key={log.id}
                className="border border-gray-200 rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
              >
                <div>
                  <p className="font-semibold text-gray-900">Group ID: {log.bulk_group_id}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(log.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="text-sm text-gray-600">
                  Units Created:{' '}
                  <span className="font-semibold text-gray-900">{log.units_created}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
