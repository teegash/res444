'use client'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Bell, Settings, Search } from 'lucide-react'

export function ManagerHeader() {
  return (
    <div className="border-b border-border bg-background px-4 md:px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 flex items-center gap-2 bg-muted rounded-lg px-3 max-w-md">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search properties, tenants..."
            className="border-0 bg-transparent focus-visible:ring-0"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <Bell className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
