'use client'

import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import type { LetterheadMeta } from './letterhead'
import { formatGeneratedAt, safeFilename } from './letterhead'
import { EXPORT_THEME } from './theme'

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

function headerLooksLikeDate(header: string) {
  const h = header.toLowerCase()
  return (
    h.includes('date') ||
    h.includes('due') ||
    h.includes('created') ||
    h.includes('posted') ||
    h.includes('updated') ||
    h.includes('start') ||
    h.includes('end')
  )
}

function headerLooksLikeMoney(header: string) {
  const h = header.toLowerCase()
  return (
    h.includes('amount') ||
    h.includes('balance') ||
    h.includes('total') ||
    h.includes('paid') ||
    h.includes('payment') ||
    h.includes('arrears') ||
    h.includes('credit') ||
    h.includes('debit') ||
    h.includes('rent') ||
    h.includes('kes') ||
    h.includes('ksh')
  )
}

function tryParseISODate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value !== 'string') return null

  const s = value.trim()
  const isoDateOnly = /^\d{4}-\d{2}-\d{2}$/
  const isoDateTime = /^\d{4}-\d{2}-\d{2}t/i

  if (isoDateOnly.test(s)) {
    const d = new Date(`${s}T00:00:00`)
    return Number.isNaN(d.getTime()) ? null : d
  }

  if (isoDateTime.test(s)) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
  }

  return null
}

function tryParseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null

  const s = value.trim()
  const cleaned = s.replace(/kes|ksh/gi, '').replace(/[,\s]/g, '').replace(/^\(+/, '').replace(/\)+$/, '')

  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
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
    const maxCols = Math.max(args.headers.length, 8)
    const midCol = Math.max(4, Math.floor(maxCols / 2))

    worksheet.getRow(1).height = EXPORT_THEME.excel.metaRowHeights.org
    worksheet.getRow(2).height = EXPORT_THEME.excel.metaRowHeights.title
    worksheet.getRow(3).height = EXPORT_THEME.excel.metaRowHeights.meta
    worksheet.getRow(4).height = EXPORT_THEME.excel.metaRowHeights.details

    worksheet.mergeCells(1, 1, 1, midCol)
    const orgCell = worksheet.getCell(1, 1)
    orgCell.value = meta.organizationName || 'RES'
    orgCell.font = { bold: true, size: 16, color: { argb: EXPORT_THEME.excel.fonts.text } }
    orgCell.alignment = { vertical: 'middle', horizontal: 'left' }

    worksheet.mergeCells(1, midCol + 1, 1, maxCols)
    const genCell = worksheet.getCell(1, midCol + 1)
    genCell.value = `Generated: ${formatGeneratedAt(meta.generatedAtISO)}`
    genCell.font = { size: 10, color: { argb: EXPORT_THEME.excel.fonts.muted } }
    genCell.alignment = { vertical: 'middle', horizontal: 'right' }

    worksheet.mergeCells(2, 1, 2, maxCols)
    const titleCell = worksheet.getCell(2, 1)
    titleCell.value = meta.documentTitle || 'Document'
    titleCell.font = { bold: true, size: 13, color: { argb: EXPORT_THEME.excel.fonts.text } }
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' }

    worksheet.mergeCells(3, 1, 3, midCol)
    const orgInfoParts: string[] = []
    if (meta.organizationLocation) orgInfoParts.push(String(meta.organizationLocation))
    if (meta.organizationPhone) orgInfoParts.push(String(meta.organizationPhone))
    const orgInfoCell = worksheet.getCell(3, 1)
    orgInfoCell.value = orgInfoParts.join(' • ')
    orgInfoCell.font = { size: 10, color: { argb: EXPORT_THEME.excel.fonts.muted } }
    orgInfoCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }

    worksheet.mergeCells(3, midCol + 1, 3, maxCols)
    const refParts: string[] = []
    if (meta.referenceNumber) refParts.push(`Ref: ${meta.referenceNumber}`)
    if (meta.reportingPeriod) refParts.push(`Period: ${meta.reportingPeriod}`)
    if (meta.preparedBy) refParts.push(`Prepared by: ${meta.preparedBy}`)
    const refCell = worksheet.getCell(3, midCol + 1)
    refCell.value = refParts.join(' • ')
    refCell.font = { size: 10, color: { argb: EXPORT_THEME.excel.fonts.muted } }
    refCell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true }

    worksheet.mergeCells(4, 1, 4, maxCols)
    const details: string[] = []
    if (meta.tenantName) details.push(`Tenant: ${meta.tenantName}`)
    if (meta.tenantPhone) details.push(`Phone: ${meta.tenantPhone}`)
    if (meta.propertyName) details.push(`Property: ${meta.propertyName}`)
    if (meta.unitNumber) details.push(`Unit: ${meta.unitNumber}`)
    const detailsCell = worksheet.getCell(4, 1)
    detailsCell.value = details.join(' • ')
    detailsCell.font = { size: 10, color: { argb: EXPORT_THEME.excel.fonts.subtle } }
    detailsCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }

    for (let c = 1; c <= maxCols; c += 1) {
      worksheet.getCell(5, c).border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } }
    }

    startRow = 7
  }

  const dateCols = new Set<number>()
  const moneyCols = new Set<number>()

  args.headers.forEach((header, idx) => {
    const label = `${header ?? ''}`
    if (headerLooksLikeDate(label)) dateCols.add(idx + 1)
    if (headerLooksLikeMoney(label)) moneyCols.add(idx + 1)
  })

  const headerRowIndex = startRow
  const headerRow = worksheet.getRow(headerRowIndex)
  headerRow.values = args.headers.map((h) => normalizeCell(h) as any)
  headerRow.font = { bold: true, color: { argb: EXPORT_THEME.excel.fonts.text } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXPORT_THEME.excel.fills.header } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' }
  headerRow.height = EXPORT_THEME.excel.headerRowHeight

  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    }
  })

  let currentRow = headerRowIndex + 1
  for (const row of args.rows) {
    const r = worksheet.getRow(currentRow)
    const coerced: any[] = []

    for (let i = 0; i < args.headers.length; i += 1) {
      const colIndex = i + 1
      const raw = row[i]

      if (dateCols.has(colIndex)) {
        const parsed = tryParseISODate(raw)
        coerced[i] = parsed ? parsed : normalizeCell(raw)
        continue
      }

      if (moneyCols.has(colIndex)) {
        const parsed = tryParseNumber(raw)
        coerced[i] = parsed !== null ? parsed : normalizeCell(raw)
        continue
      }

      coerced[i] = normalizeCell(raw)
    }

    for (let i = 0; i < coerced.length; i += 1) {
      r.getCell(i + 1).value = coerced[i]
    }

    r.alignment = { vertical: 'top', horizontal: 'left', wrapText: true }

    r.eachCell((cell) => {
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFF1F5F9' } },
      }
    })

    currentRow += 1
  }

  if (args.summaryRows?.length) {
    currentRow += 1
    for (const row of args.summaryRows) {
      const r = worksheet.getRow(currentRow)
      r.values = row.map((cell) => normalizeCell(cell) as any)
      r.font = { bold: true, color: { argb: 'FF0F172A' } }
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXPORT_THEME.excel.fills.summary } }
      r.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
      currentRow += 1
    }
  }

  for (let c = 1; c <= args.headers.length; c += 1) {
    const col = worksheet.getColumn(c)

    if (dateCols.has(c)) {
      col.numFmt = 'dd-mmm-yyyy'
      col.alignment = { horizontal: 'left', vertical: 'middle' }
    }

    if (moneyCols.has(c)) {
      col.numFmt = '"KES" #,##0.00;[Red]"KES" -#,##0.00'
      col.alignment = { horizontal: 'right', vertical: 'middle' }
    }
  }

  const allRowsForWidth: Array<Array<string | number>> = [args.headers, ...args.rows, ...(args.summaryRows || [])]
  const widths = computeColWidths(allRowsForWidth)
  widths.forEach((wch, idx) => {
    worksheet.getColumn(idx + 1).width = Math.max(10, Math.min(60, wch))
  })

  worksheet.views = [{ state: 'frozen', ySplit: headerRowIndex }]

  if (meta?.organizationName) {
    currentRow += 2
    worksheet.mergeCells(currentRow, 1, currentRow, Math.max(args.headers.length, 6))
    const footerCell = worksheet.getCell(currentRow, 1)
    footerCell.value = `Generated by ${meta.organizationName} System`
    footerCell.font = { italic: true, size: 10, color: { argb: EXPORT_THEME.excel.fonts.muted } }
    footerCell.alignment = { horizontal: 'left', vertical: 'middle' }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  saveAs(blob, `${safeFilename(args.filenameBase)}.xlsx`)
}

export const exportXlsx = exportExcelWithLetterhead
