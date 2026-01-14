'use client'

import { dashboardTourStore } from '@/lib/tour/dashboardTourStore'

export default function TourButton() {
  const startTour = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('res_tour_water_v1_done')
      window.localStorage.setItem('res_tour_water_v1_step', '0')
    }
    dashboardTourStore.start(0)
  }

  return (
    <button
      type="button"
      onClick={startTour}
      className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
      aria-label="Start guided tour"
    >
      Tour
    </button>
  )
}
