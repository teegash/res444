'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BulkUnitCreation } from '@/components/dashboard/bulk-unit-creation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface AddPropertyModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddPropertyModal({ open, onOpenChange }: AddPropertyModalProps) {
  const [step, setStep] = useState<'info' | 'units'>('info')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Add New Property</DialogTitle>
        </DialogHeader>

        {step === 'info' ? (
          <div className="space-y-6 py-2">
            {/* Building Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Building Information</h3>
              <div>
                <Label htmlFor="building-name">Building Name *</Label>
                <Input id="building-name" placeholder="e.g., Alpha Complex" />
              </div>
              <div>
                <Label htmlFor="location">Location/Address *</Label>
                <Textarea id="location" placeholder="Full address..." />
              </div>
              <div>
                <Label htmlFor="county">County *</Label>
                <Select>
                  <SelectTrigger id="county">
                    <SelectValue placeholder="Select county..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nairobi">Nairobi</SelectItem>
                    <SelectItem value="mombasa">Mombasa</SelectItem>
                    <SelectItem value="kisumu">Kisumu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="manager">Manager Assignment</Label>
                <Select>
                  <SelectTrigger id="manager">
                    <SelectValue placeholder="Select manager..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager1">Manager 1</SelectItem>
                    <SelectItem value="manager2">Manager 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" placeholder="Building description..." />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="min-w-[100px]">
                Cancel
              </Button>
              <Button onClick={() => setStep('units')} className="min-w-[140px] bg-[#4682B4] hover:bg-[#4682B4]/90">
                Next: Add Units
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6 py-2">
            <BulkUnitCreation />
            <div className="flex justify-between gap-3 pt-4 border-t border-gray-200">
              <Button variant="outline" onClick={() => setStep('info')} className="min-w-[100px]">
                Back
              </Button>
              <div className="flex gap-3">
                <Button variant="outline" className="min-w-[130px]">Save as Draft</Button>
                <Button className="min-w-[180px] bg-[#4682B4] hover:bg-[#4682B4]/90">Create Property & Units</Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
