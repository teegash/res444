'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface MobileGridProps {
  children: React.ReactNode
  columns?: 1 | 2 | 3
  className?: string
}

export const MobileGrid = ({ children, columns = 1, className = '' }: MobileGridProps) => {
  return (
    <div className={cn('mobile-grid', columns === 2 && 'cols-2', columns === 3 && 'cols-3', className)}>
      {children}
    </div>
  )
}
