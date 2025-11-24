'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface MobileHStackProps {
  children: React.ReactNode
  spacing?: 'tight' | 'normal' | 'comfortable'
  justify?: 'between' | 'start' | 'center' | 'end'
  align?: 'start' | 'center' | 'end'
  className?: string
}

export const MobileHStack = ({
  children,
  spacing = 'normal',
  justify = 'start',
  align = 'center',
  className = '',
}: MobileHStackProps) => {
  return (
    <div
      className={cn(
        'mobile-hstack',
        spacing,
        justify === 'between' && 'justify-between',
        justify === 'start' && 'justify-start',
        justify === 'center' && 'justify-center',
        justify === 'end' && 'justify-end',
        align === 'start' && 'align-start',
        align === 'center' && 'align-center',
        align === 'end' && 'align-end',
        className
      )}
    >
      {children}
    </div>
  )
}
