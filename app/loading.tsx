'use client'

import { Skeleton } from '@/components/ui/skeleton'

export default function AppLoading() {
  const rows = Array.from({ length: 6 })

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-white px-6 py-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="space-y-4">
          <Skeleton className="h-6 w-48" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        </div>

        <div className="rounded-2xl border bg-white shadow-sm p-6 space-y-6">
          {rows.map((_, index) => (
            <div key={index} className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <div className="hidden md:flex gap-3">
                <Skeleton className="h-8 w-20 rounded-full" />
                <Skeleton className="h-8 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    </div>
  )
}
