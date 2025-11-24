'use client'

import React from 'react'

interface MobileListItemProps {
  icon?: React.ReactNode
  title: string
  subtitle?: string
  right?: React.ReactNode
  onClick?: () => void
}

export const MobileListItem = ({ icon, title, subtitle, right, onClick }: MobileListItemProps) => {
  return (
    <div className="mobile-list-item" onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
      {icon && <div className="mobile-list-item-icon">{icon}</div>}
      <div className="mobile-list-item-content">
        <p className="mobile-list-item-title">{title}</p>
        {subtitle && <p className="mobile-list-item-subtitle">{subtitle}</p>}
      </div>
      {right && <div className="mobile-list-item-right">{right}</div>}
    </div>
  )
}
