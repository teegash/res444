'use client'

import * as React from 'react'
import * as echarts from 'echarts'
import { cn } from '@/lib/utils'

export type EChartsOption = echarts.EChartsOption

type Props = {
  option: EChartsOption
  className?: string
  style?: React.CSSProperties
}

export function EChart({ option, className, style }: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const chartRef = React.useRef<echarts.ECharts | null>(null)

  React.useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const chart = chartRef.current || echarts.init(node)
    chartRef.current = chart
    chart.setOption(option, true)

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [option])

  React.useEffect(() => {
    return () => {
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  return <div ref={containerRef} className={cn('w-full', className)} style={style} />
}
