'use client'

type Listener = () => void

type DashboardTourState = {
  run: boolean
  stepIndex: number
}

const state: DashboardTourState = {
  run: false,
  stepIndex: 0,
}

const listeners = new Set<Listener>()

function emit() {
  for (const listener of listeners) listener()
}

export const dashboardTourStore = {
  getState() {
    return { ...state }
  },

  subscribe(listener: Listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  start(stepIndex = 0) {
    state.stepIndex = stepIndex
    state.run = true
    emit()
  },

  stop() {
    state.run = false
    emit()
  },

  setStepIndex(i: number) {
    state.stepIndex = i
    emit()
  },
}
