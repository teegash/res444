'use client'

import React from 'react'
import { MobileCard } from './MobileCard'
import { MobileHStack } from './MobileHStack'

interface MobileTableProps {
  headers: string[]
  rows: (string | React.ReactNode)[][]
  className?: string
}

export const MobileTable = ({ headers, rows, className = '' }: MobileTableProps) => {
  return (
    <div className={`mobile-table-stack ${className}`}>
      {rows.map((row, rowIdx) => (
        <MobileCard key={rowIdx}>
          {row.map((cell, cellIdx) => (
            <MobileHStack key={cellIdx} justify="between" align="center" className="mobile-table-cell">
              <span className="mobile-table-label">{headers[cellIdx]}</span>
              <span className="mobile-table-value">{cell}</span>
            </MobileHStack>
          ))}
        </MobileCard>
      ))}
    </div>
  )
}
