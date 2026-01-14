'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride'
import { dashboardTourStore } from '@/lib/tour/dashboardTourStore'
import { useAuth } from '@/lib/auth/context'

const TOUR_DONE_KEY = 'res_tour_water_v1_done'
const TOUR_STEP_KEY = 'res_tour_water_v1_step'

function useDashboardTourStore() {
  return useSyncExternalStore(
    dashboardTourStore.subscribe,
    dashboardTourStore.getState,
    dashboardTourStore.getState
  )
}

export default function DashboardTour() {
  const { user } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const { run, stepIndex } = useDashboardTourStore()
  const [ready, setReady] = useState(false)

  const steps: Step[] = useMemo(
    () => [
      {
        target: '[data-tour="sidebar-nav"]',
        title: 'Navigate between tabs',
        content:
          'Use the left sidebar to move between modules (Dashboard, Tenants, Payments, Water Bills, etc.).',
        placement: 'right',
        disableBeacon: true,
      },
      {
        target: '[data-tour="nav-water-bills"]',
        title: 'Open Water Bills',
        content:
          'Select “Water Bills” to open billing tools. The tour can navigate you there automatically when you click Next.',
        placement: 'right',
      },
      {
        target: '[data-tour="water-bills-header"]',
        title: 'Water Bills page',
        content:
          'This page is where you create and send water bill invoices. You can do Single billing or Bulk billing.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="water-bills-bulk-btn"]',
        title: 'Bulk billing option',
        content:
          'Use Bulk Billing when you want to bill multiple units at once (e.g., an entire property).',
        placement: 'bottom',
      },
      {
        target: '[data-tour="water-bills-single-form"]',
        title: 'Single billing option',
        content:
          'Use this form to bill one unit: select property & unit, enter readings, and send the invoice.',
        placement: 'top',
      },
    ],
    []
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    if (!user) return
    if (!pathname.startsWith('/dashboard')) return

    const done = window.localStorage.getItem(TOUR_DONE_KEY) === '1'
    if (done) return

    const savedStep = Number(window.localStorage.getItem(TOUR_STEP_KEY) || '0')
    const startAt = Number.isFinite(savedStep) ? Math.max(0, savedStep) : 0

    if (!dashboardTourStore.getState().run) {
      dashboardTourStore.start(startAt)
    }
  }, [ready, user, pathname])

  const handleCallback = (data: CallBackProps) => {
    const { status, index, action, type } = data

    if (typeof window !== 'undefined' && (type === 'step:after' || type === 'target:notFound')) {
      const current = index ?? 0
      const nextIndex = Math.max(0, current + (action === 'prev' ? -1 : 1))
      window.localStorage.setItem(TOUR_STEP_KEY, String(nextIndex))
      dashboardTourStore.setStepIndex(nextIndex)
    }

    if (action === 'next' && index === 1) {
      if (pathname !== '/dashboard/water-bills') {
        router.push('/dashboard/water-bills')
        return
      }
    }

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(TOUR_DONE_KEY, '1')
        window.localStorage.removeItem(TOUR_STEP_KEY)
      }
      dashboardTourStore.stop()
      dashboardTourStore.setStepIndex(0)
    }
  }

  if (!ready) return null
  if (!user) return null
  if (!pathname.startsWith('/dashboard')) return null

  return (
    <Joyride
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      continuous
      showProgress
      showSkipButton
      disableOverlayClose={false}
      spotlightPadding={8}
      callback={handleCallback}
      styles={{
        options: {
          zIndex: 9999,
          primaryColor: '#4682B4',
        },
        overlay: {
          mixBlendMode: 'normal',
        },
      }}
    />
  )
}
