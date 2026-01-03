'use client'

/**
 * Export theme used across PDF/Excel/CSV exports.
 *
 * Design intent: neutral, enterprise styling (clean hierarchy, subtle rules, calm tables)
 * so every export format feels consistent and "premium".
 */
export const EXPORT_THEME = {
  page: {
    marginX: 40,
    footerHeight: 46,
    headerTopPad: 26,
  },
  colors: {
    text: [15, 23, 42] as [number, number, number],
    muted: [71, 85, 105] as [number, number, number],
    subtle: [100, 116, 139] as [number, number, number],
    border: [226, 232, 240] as [number, number, number],
    headerFill: [241, 245, 249] as [number, number, number],
    zebraFill: [248, 250, 252] as [number, number, number],
    summaryFill: [241, 245, 249] as [number, number, number],
    accent: [72, 103, 164] as [number, number, number],
  },
  pdf: {
    titleSize: 13,
    orgSize: 16,
    metaSize: 9.5,
    bodySize: 9.5,
    table: {
      cellPadding: 5,
      lineWidth: 0.35,
    },
  },
  excel: {
    headerRowHeight: 20,
    metaRowHeights: {
      org: 26,
      title: 20,
      meta: 18,
      details: 18,
    },
    fills: {
      header: 'FFF1F5F9',
      summary: 'FFF1F5F9',
    },
    fonts: {
      text: 'FF0F172A',
      muted: 'FF64748B',
      subtle: 'FF475569',
    },
  },
} as const
