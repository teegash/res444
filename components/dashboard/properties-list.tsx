'use client'

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
import { Edit2, Users, Eye } from 'lucide-react'

const properties = [
  {
    id: 1,
    name: 'Alpha Complex',
    location: 'Nairobi',
    total: 15,
    occupied: 12,
    avgRevenue: 'KES 120,000',
    status: 'Active',
  },
  {
    id: 2,
    name: 'Beta Towers',
    location: 'Westlands',
    total: 10,
    occupied: 8,
    avgRevenue: 'KES 80,000',
    status: 'Active',
  },
  {
    id: 3,
    name: 'Gamma Heights',
    location: 'Karen',
    total: 20,
    occupied: 18,
    avgRevenue: 'KES 180,000',
    status: 'Active',
  },
]

interface PropertiesListProps {
  onEdit: (property: any) => void
  onManageUnits: (property: any) => void
  onView: (id: number) => void
}

export function PropertiesList({ onEdit, onManageUnits, onView }: PropertiesListProps) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Building Name</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Total Units</TableHead>
            <TableHead>Occupied</TableHead>
            <TableHead>Avg Revenue</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {properties.map((property) => (
            <TableRow key={property.id}>
              <TableCell className="font-medium">{property.name}</TableCell>
              <TableCell>{property.location}</TableCell>
              <TableCell>{property.total}</TableCell>
              <TableCell>
                {property.occupied}/{property.total}
              </TableCell>
              <TableCell>{property.avgRevenue}</TableCell>
              <TableCell>
                <Badge className="bg-green-600">{property.status}</Badge>
              </TableCell>
              <TableCell className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onView(property.id)}
                  title="View property details"
                >
                  <Eye className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(property)}
                  title="Edit property"
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onManageUnits(property)}
                  title="Manage units"
                >
                  <Users className="w-4 h-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
