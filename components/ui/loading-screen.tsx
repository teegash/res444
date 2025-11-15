'use client'

import { Loader2 } from 'lucide-react'

export function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col items-center justify-center gap-6">
      <div className="relative">
        <div className="h-24 w-24 rounded-full border-4 border-[#4682B4]/20 border-t-[#4682B4] animate-spin" />
        <Loader2 className="h-10 w-10 text-[#4682B4] absolute inset-0 m-auto animate-pulse" />
      </div>
      <div className="space-y-2 text-center">
        <p className="text-lg font-semibold text-gray-900">Preparing your workspace</p>
        <p className="text-sm text-gray-500">
          Fetching the latest data across properties, tenants, and finances…
        </p>
      </div>
      <div className="flex gap-2">
        <span className="h-2 w-2 rounded-full bg-[#4682B4] animate-bounce [animation-delay:-0.3s]" />
        <span className="h-2 w-2 rounded-full bg-[#4682B4] animate-bounce [animation-delay:-0.15s]" />
        <span className="h-2 w-2 rounded-full bg-[#4682B4] animate-bounce" />
      </div>
    </div>
  )
}
