import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LayoutGrid, List, Plus } from 'lucide-react'

interface PropertiesHeaderProps {
  viewType: 'grid' | 'list'
  setViewType: (type: 'grid' | 'list') => void
  onAddProperty: () => void
}

export function PropertiesHeader({
  viewType,
  setViewType,
  onAddProperty,
}: PropertiesHeaderProps) {
  return (
    <div className="mb-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">My Properties</h1>
        <Button onClick={onAddProperty} className="gap-2">
          <Plus className="w-4 h-4" />
          Add New Property
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Input placeholder="Search by building name..." />
        </div>
        <div className="flex gap-2">
          <Button
            variant={viewType === 'grid' ? 'default' : 'outline'}
            size="icon"
            onClick={() => setViewType('grid')}
          >
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button
            variant={viewType === 'list' ? 'default' : 'outline'}
            size="icon"
            onClick={() => setViewType('list')}
          >
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
