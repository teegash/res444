'use client'

import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'
import type { LetterheadMeta } from './letterhead'

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? value : ''
  return `${value}`
}

function computeColWidths(rows: Array<Array<string | number>>) {
  const widths: number[] = []
  for (const row of rows) {
    row.forEach((cell, idx) => {
      const text = `${cell ?? ''}`
      const len = Math.min(60, text.length)
      widths[idx] = Math.max(widths[idx] || 10, len + 2)
    })
  }
  return widths.map((wch) => ({ wch }))
}

export function exportExcelWithLetterhead(args: {
  filenameBase: string
  sheetName?: string
  meta?: LetterheadMeta | null
  headers: string[]
  rows: Array<Array<string | number>>
  summaryRows?: Array<Array<string | number>>
}) {
  const aoa: Array<Array<string | number>> = []

  if (args.meta) {
    const m = args.meta
    aoa.push(['Organization', normalizeCell(m.organizationName)])
    if (m.organizationLocation) aoa.push(['Location', normalizeCell(m.organizationLocation)])
    if (m.organizationPhone) aoa.push(['Phone', normalizeCell(m.organizationPhone)])
    if (m.organizationLogoUrl) aoa.push(['Logo URL', normalizeCell(m.organizationLogoUrl)])
    aoa.push(['Document', normalizeCell(m.documentTitle)])
    aoa.push(['Generated', normalizeCell(m.generatedAtISO)])
    if (m.tenantName) aoa.push(['Tenant', normalizeCell(m.tenantName)])
    if (m.tenantPhone) aoa.push(['Tenant Phone', normalizeCell(m.tenantPhone)])
    if (m.propertyName) aoa.push(['Property', normalizeCell(m.propertyName)])
    if (m.unitNumber) aoa.push(['Unit', normalizeCell(m.unitNumber)])
    aoa.push([])
  }

  aoa.push(args.headers.map((h) => normalizeCell(h) as any))
  for (const row of args.rows) {
    aoa.push(row.map((cell) => normalizeCell(cell) as any))
  }

  if (args.summaryRows?.length) {
    aoa.push([])
    for (const row of args.summaryRows) {
      aoa.push(row.map((cell) => normalizeCell(cell) as any))
    }
  }

  const worksheet = XLSX.utils.aoa_to_sheet(aoa)
  worksheet['!cols'] = computeColWidths(aoa as any)

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, args.sheetName || 'Report')

  const xlsxArray = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true })
  const blob = new Blob([xlsxArray], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  saveAs(blob, `${args.filenameBase}.xlsx`)
}

// Backward-friendly alias name (as referenced in the implementation guide).
export const exportXlsx = exportExcelWithLetterhead
