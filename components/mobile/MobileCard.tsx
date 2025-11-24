'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface MobileCardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  variant?: 'default' | 'elevated'
  clickable?: boolean
}

export const MobileCard = ({
  children,
  className = '',
  onClick,
  variant = 'default',
  clickable = false,
}: MobileCardProps) => {
  return (
    <div
      className={cn(
        'mobile-card',
        variant === 'elevated' && 'elevated',
        (clickable || onClick) && 'clickable',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  )
}
