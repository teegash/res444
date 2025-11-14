'use client'

import { useState } from 'react'
import { OrganizationSetupWizard } from '@/components/dashboard/organization-setup-wizard'

export default function SetupPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-4">
      <OrganizationSetupWizard />
    </div>
  )
}
