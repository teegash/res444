'use client'

import { useEffect, useState, useMemo } from 'react'
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
import { Edit2, Users, Eye, Loader2 } from 'lucide-react'

interface PropertiesListProps {
  onEdit: (property: any) => void
  onManageUnits: (property: any) => void
  onView: (id: string) => void
}

export function PropertiesList({ onEdit, onManageUnits, onView }: PropertiesListProps) {
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProperties = useMemo(
    () => async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch('/api/properties', {
          credentials: 'include',
          cache: 'no-store',
        })
        const result = await response.json()

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to load properties')
        }

        setProperties(result.data || [])
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load properties.'
        setError(message)
        setProperties([])
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    fetchProperties()
  }, [fetchProperties])

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Building Name</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Total Units</TableHead>
            <TableHead>Occupied Units</TableHead>
            <TableHead>Occupancy</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                <div className="flex items-center justify-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-[#4682B4]" />
                  Loading properties...
                </div>
              </TableCell>
            </TableRow>
          ) : error ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-red-600">
                {error}
              </TableCell>
            </TableRow>
          ) : properties.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                No properties found. Add your first building to get started.
              </TableCell>
            </TableRow>
          ) : (
            properties.map((property) => {
              const occupancy =
                property.totalUnits > 0
                  ? Math.round((property.occupiedUnits / property.totalUnits) * 100)
                  : 0
              const buildingIdRaw =
                property?.id ??
                property?.building_id ??
                property?.buildingId ??
                property?.apartment_building_id
              const buildingId =
                typeof buildingIdRaw === 'string'
                  ? buildingIdRaw.trim()
                  : buildingIdRaw === null || buildingIdRaw === undefined
                    ? ''
                    : String(buildingIdRaw)

              if (!buildingId) {
                console.warn('[PropertiesList] Missing building id for row', property)
                return null
              }

              return (
                <TableRow key={buildingId || property.id}>
                  <TableCell className="font-medium">{property.name}</TableCell>
                  <TableCell>{property.location}</TableCell>
                  <TableCell>{property.totalUnits}</TableCell>
                  <TableCell>
                    {property.occupiedUnits}/{property.totalUnits}
                  </TableCell>
                  <TableCell>
                    <Badge variant={occupancy >= 80 ? 'default' : 'secondary'}>{occupancy}%</Badge>
                  </TableCell>
                  <TableCell className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => buildingId && onView(buildingId)}
                      title="View property details"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit({ ...property, id: buildingId })}
                      title="Edit property"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onManageUnits({ ...property, id: buildingId })}
                      title="Manage units"
                    >
                      <Users className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}
