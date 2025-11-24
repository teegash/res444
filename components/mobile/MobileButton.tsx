'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface MobileButtonProps {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  icon?: React.ReactNode
  className?: string
}

export const MobileButton = ({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  type = 'button',
  icon,
  className = '',
}: MobileButtonProps) => {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn('mobile-button', variant, size, fullWidth && 'full-width', className)}
    >
      {icon && <span>{icon}</span>}
      {children}
    </button>
  )
}
