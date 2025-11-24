'use client'

import React from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { MobileBottomNav } from './MobileBottomNav'

interface MobilePageContainerProps {
  children: React.ReactNode
  title?: string
  subtitle?: string
  showBottomNav?: boolean
  bottomNavVariant?: 'manager' | 'tenant'
}

export const MobilePageContainer = ({
  children,
  title,
  subtitle,
  showBottomNav = true,
  bottomNavVariant = 'tenant',
}: MobilePageContainerProps) => {
  const isMobile = useMediaQuery('(max-width: 767px)')
  if (!isMobile) return <>{children}</>

  return (
    <div className="mobile-page-container mobile-only">
      {title && (
        <header className="mobile-page-header">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </header>
      )}
      {children}
      {showBottomNav && <MobileBottomNav variant={bottomNavVariant} />}
    </div>
  )
}
