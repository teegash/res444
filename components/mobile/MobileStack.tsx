'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface MobileStackProps {
  children: React.ReactNode
  spacing?: 'tight' | 'normal' | 'comfortable' | 'spacious'
  className?: string
}

export const MobileStack = ({ children, spacing = 'comfortable', className = '' }: MobileStackProps) => {
  return <div className={cn('mobile-stack', spacing, className)}>{children}</div>
}
