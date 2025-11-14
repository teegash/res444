'use client'

import { useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { OrganizationSetupWizard } from './organization-setup-wizard'

interface OrganizationSetupModalProps {
  open: boolean
  onClose: () => void
}

export function OrganizationSetupModal({ open, onClose }: OrganizationSetupModalProps) {
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        onClose()
      }
    },
    [onClose]
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="mb-4 text-left">
          <DialogTitle className="text-2xl font-bold">Complete Your Organization Setup</DialogTitle>
          <DialogDescription>
            Provide your organization details to unlock the full manager experience. This only takes a few minutes.
          </DialogDescription>
        </DialogHeader>
        <div className="px-1">
          <OrganizationSetupWizard />
        </div>
      </DialogContent>
    </Dialog>
  )
}
