'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface MobileInputProps {
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'date'
  label?: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
  disabled?: boolean
  className?: string
}

export const MobileInput = ({
  type = 'text',
  label,
  placeholder,
  value,
  onChange,
  error,
  required = false,
  disabled = false,
  className = '',
}: MobileInputProps) => {
  return (
    <div className="mobile-input-group">
      {label && (
        <label className={cn('mobile-input-label', required && 'required')}>
          {label}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={cn('mobile-input', error && 'error', className)}
      />
      {error && <p className="mobile-input-error">{error}</p>}
    </div>
  )
}
