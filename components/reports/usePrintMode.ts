'use client'

import * as React from 'react'

type UsePrintModeOptions = {
  onBeforePrint?: () => void
  onAfterPrint?: () => void
  printDelayMs?: number
}

export function usePrintMode(options?: UsePrintModeOptions) {
  const [isPrinting, setIsPrinting] = React.useState(false)

  React.useEffect(() => {
    const handleBefore = () => {
      setIsPrinting(true)
      options?.onBeforePrint?.()
    }

    const handleAfter = () => {
      setIsPrinting(false)
      options?.onAfterPrint?.()
    }

    window.addEventListener('beforeprint', handleBefore)
    window.addEventListener('afterprint', handleAfter)

    return () => {
      window.removeEventListener('beforeprint', handleBefore)
      window.removeEventListener('afterprint', handleAfter)
    }
  }, [options])

  const triggerPrint = React.useCallback(() => {
    setIsPrinting(true)

    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'))
      options?.onBeforePrint?.()

      setTimeout(() => {
        window.print()
      }, options?.printDelayMs ?? 80)
    })
  }, [options])

  return { isPrinting, triggerPrint }
}
