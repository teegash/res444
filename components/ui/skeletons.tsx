'use client'

import React from 'react'
import { cn } from '@/lib/utils'

type SkeletonLoaderProps = {
  width?: number | string
  height?: number | string
  count?: number
  className?: string
  rounded?: string
}

const basePulseClass = 'animate-pulse bg-gray-200 dark:bg-gray-800'

export function SkeletonLoader({
  width = '100%',
  height = 16,
  count = 1,
  className,
  rounded = 'rounded-md',
}: SkeletonLoaderProps) {
  const items = Array.from({ length: count })
  return (
    <div aria-label="Loading..." role="status" className="space-y-2">
      {items.map((_, idx) => (
        <div
          key={idx}
          className={cn(basePulseClass, rounded, className)}
          style={{ width, height, animationDuration: '2.4s' }}
        />
      ))}
    </div>
  )
}

type SkeletonCardProps = {
  count?: number
}

export function SkeletonPropertyCard({ count = 4 }: SkeletonCardProps) {
  const items = Array.from({ length: count })
  return (
    <div aria-label="Loading..." role="status" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((_, idx) => (
        <div key={idx} className="p-4 border rounded-xl bg-white shadow-sm dark:bg-gray-900 dark:border-gray-800">
          <div className="flex items-center gap-3 mb-3">
            <div className={cn(basePulseClass, 'rounded-full')} style={{ width: 40, height: 40, animationDuration: '2.2s' }} />
            <div className="flex-1 space-y-2">
              <SkeletonLoader height={12} width="70%" />
              <SkeletonLoader height={10} width="50%" />
            </div>
          </div>
          <SkeletonLoader height={32} width="100%" rounded="rounded-lg" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <SkeletonLoader height={10} />
            <SkeletonLoader height={10} />
          </div>
        </div>
      ))}
    </div>
  )
}

type SkeletonTableProps = {
  rows?: number
  columns?: number
}

export function SkeletonTable({ rows = 6, columns = 4 }: SkeletonTableProps) {
  const rowArray = Array.from({ length: rows })
  const colArray = Array.from({ length: columns })
  return (
    <div aria-label="Loading..." role="status" className="w-full rounded-xl border bg-white p-4 shadow-sm dark:bg-gray-900 dark:border-gray-800">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {colArray.map((_, idx) => (
                <th key={idx} className="p-2">
                  <SkeletonLoader height={12} width="80%" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowArray.map((_, rIdx) => (
              <tr key={rIdx} className="border-t dark:border-gray-800">
                {colArray.map((_, cIdx) => (
                  <td key={cIdx} className="p-2">
                    <SkeletonLoader height={12} width={`${60 + cIdx * 10}%`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type SkeletonChartProps = {
  bars?: number
}

export function SkeletonChart({ bars = 6 }: SkeletonChartProps) {
  const items = Array.from({ length: bars })
  return (
    <div aria-label="Loading..." role="status" className="p-4 rounded-xl border bg-white shadow-sm dark:bg-gray-900 dark:border-gray-800">
      <div className="h-56 flex items-end gap-3">
        {items.map((_, idx) => (
          <div
            key={idx}
            className={cn(basePulseClass, 'rounded-md flex-1')}
            style={{
              height: `${40 + idx * (40 / bars)}%`,
              animationDuration: '2.6s',
            }}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <SkeletonLoader height={10} />
        <SkeletonLoader height={10} />
        <SkeletonLoader height={10} />
      </div>
    </div>
  )
}
