'use client'

import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import type { LetterheadMeta } from './letterhead'
import { safeFilename } from './letterhead'

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
  return widths
}

export async function exportExcelWithLetterhead(args: {
  filenameBase: string
  sheetName?: string
  meta?: LetterheadMeta | null
  headers: string[]
  rows: Array<Array<string | number>>
  summaryRows?: Array<Array<string | number>>
}) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = args.meta?.organizationName || 'RES'
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet(args.sheetName || 'Report', {
    properties: { defaultRowHeight: 18 },
    views: [{ state: 'frozen', ySplit: 0 }],
  })

  const meta = args.meta || null
  let startRow = 1

  if (meta) {
    const maxCols = Math.max(args.headers.length, 6)

    worksheet.getRow(1).height = 30
    worksheet.getRow(2).height = 20
    worksheet.getRow(3).height = 18
    worksheet.getRow(4).height = 18

    worksheet.mergeCells(1, 1, 1, maxCols)
    const orgCell = worksheet.getCell(1, 1)
    orgCell.value = meta.organizationName || 'RES'
    orgCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4867A4' } }
    orgCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
    orgCell.alignment = { vertical: 'middle', horizontal: 'left' }

    worksheet.mergeCells(2, 1, 2, maxCols)
    const titleCell = worksheet.getCell(2, 1)
    titleCell.value = meta.documentTitle || 'Document'
    titleCell.font = { bold: true, size: 12, color: { argb: 'FF0F172A' } }
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' }

    const infoParts: string[] = [`Generated: ${meta.generatedAtISO}`]
    if (meta.organizationLocation) infoParts.push(`Location: ${meta.organizationLocation}`)
    if (meta.organizationPhone) infoParts.push(`Phone: ${meta.organizationPhone}`)

    worksheet.mergeCells(3, 1, 3, maxCols)
    const infoCell = worksheet.getCell(3, 1)
    infoCell.value = infoParts.join(' • ')
    infoCell.font = { size: 10, color: { argb: 'FF64748B' } }
    infoCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }

    const details: string[] = []
    if (meta.tenantName) details.push(`Tenant: ${meta.tenantName}`)
    if (meta.tenantPhone) details.push(`Tenant Phone: ${meta.tenantPhone}`)
    if (meta.propertyName) details.push(`Property: ${meta.propertyName}`)
    if (meta.unitNumber) details.push(`Unit: ${meta.unitNumber}`)

    worksheet.mergeCells(4, 1, 4, maxCols)
    const detailsCell = worksheet.getCell(4, 1)
    detailsCell.value = details.join(' • ')
    detailsCell.font = { size: 10, color: { argb: 'FF475569' } }
    detailsCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }

    startRow = 6
  }

  // Table headers
  const headerRowIndex = startRow
  const headerRow = worksheet.getRow(headerRowIndex)
  headerRow.values = args.headers.map((h) => normalizeCell(h) as any)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4867A4' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' }
  headerRow.height = 20

  // Data rows
  let currentRow = headerRowIndex + 1
  for (const row of args.rows) {
    const r = worksheet.getRow(currentRow)
    r.values = row.map((cell) => normalizeCell(cell) as any)
    r.alignment = { vertical: 'top', horizontal: 'left', wrapText: true }
    currentRow += 1
  }

  if (args.summaryRows?.length) {
    currentRow += 1
    for (const row of args.summaryRows) {
      const r = worksheet.getRow(currentRow)
      r.values = row.map((cell) => normalizeCell(cell) as any)
      r.font = { bold: true, color: { argb: 'FF0F172A' } }
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
      r.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
      currentRow += 1
    }
  }

  // Column widths
  const allRowsForWidth: Array<Array<string | number>> = [args.headers, ...args.rows, ...(args.summaryRows || [])]
  const widths = computeColWidths(allRowsForWidth)
  widths.forEach((wch, idx) => {
    worksheet.getColumn(idx + 1).width = Math.max(10, Math.min(60, wch))
  })

  // Freeze headers
  worksheet.views = [{ state: 'frozen', ySplit: headerRowIndex }]

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  saveAs(blob, `${safeFilename(args.filenameBase)}.xlsx`)
}

// Backward-friendly alias name (as referenced in the implementation guide).
export const exportXlsx = exportExcelWithLetterhead
