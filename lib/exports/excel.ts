'use client'

import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import type { LetterheadMeta } from './letterhead'
import { safeFilename } from './letterhead'
import { loadImageAsDataUrl } from './image'

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

function base64FromDataUrl(dataUrl: string) {
  const comma = dataUrl.indexOf(',')
  if (comma === -1) return dataUrl
  return dataUrl.slice(comma + 1)
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
    // Reserve header rows
    worksheet.getRow(1).height = 30
    worksheet.getRow(2).height = 18
    worksheet.getRow(3).height = 18
    worksheet.getRow(4).height = 18

    // Logo box: A1:A3
    worksheet.mergeCells(1, 1, 3, 1)
    worksheet.getCell(1, 1).value = ''
    worksheet.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
    worksheet.getCell(1, 1).border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    }

    // Org name and title on row 1/2
    const titleColStart = 2
    const titleColEnd = Math.max(titleColStart + 3, args.headers.length + 1)
    worksheet.mergeCells(1, titleColStart, 1, titleColEnd)
    const orgCell = worksheet.getCell(1, titleColStart)
    orgCell.value = meta.organizationName || 'RES'
    orgCell.font = { bold: true, size: 16, color: { argb: 'FF0F172A' } }
    orgCell.alignment = { vertical: 'middle', horizontal: 'left' }

    worksheet.mergeCells(2, titleColStart, 2, titleColEnd)
    const docCell = worksheet.getCell(2, titleColStart)
    docCell.value = meta.documentTitle || 'Document'
    docCell.font = { bold: true, size: 12, color: { argb: 'FF334155' } }
    docCell.alignment = { vertical: 'middle', horizontal: 'left' }

    worksheet.mergeCells(3, titleColStart, 3, titleColEnd)
    const metaCell = worksheet.getCell(3, titleColStart)
    metaCell.value = `Generated: ${meta.generatedAtISO}`
    metaCell.font = { size: 10, color: { argb: 'FF64748B' } }
    metaCell.alignment = { vertical: 'middle', horizontal: 'left' }

    // Optional right-side details row 4
    const details: string[] = []
    if (meta.tenantName) details.push(`Tenant: ${meta.tenantName}`)
    if (meta.propertyName) details.push(`Property: ${meta.propertyName}`)
    if (meta.unitNumber) details.push(`Unit: ${meta.unitNumber}`)
    if (details.length) {
      worksheet.mergeCells(4, titleColStart, 4, titleColEnd)
      const dCell = worksheet.getCell(4, titleColStart)
      dCell.value = details.join(' • ')
      dCell.font = { size: 10, color: { argb: 'FF475569' } }
      dCell.alignment = { vertical: 'middle', horizontal: 'left' }
    } else {
      worksheet.mergeCells(4, titleColStart, 4, titleColEnd)
    }

    // Insert logo image (if available)
    if (meta.organizationLogoUrl) {
      const loaded = await loadImageAsDataUrl(meta.organizationLogoUrl)
      if (loaded?.dataUrl) {
        const imageId = workbook.addImage({
          base64: base64FromDataUrl(loaded.dataUrl),
          extension: 'png',
        })
        // Fill the box: A1 (0,0) to A3, stretch within.
        worksheet.addImage(imageId, {
          tl: { col: 0.05, row: 0.15 },
          ext: { width: 56, height: 56 },
          editAs: 'oneCell',
        })
      }
    }

    startRow = 6
  }

  // Table headers
  const headerRowIndex = startRow
  const headerRow = worksheet.getRow(headerRowIndex)
  headerRow.values = [''].concat(args.headers.map((h) => normalizeCell(h) as any))
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' }
  headerRow.height = 20

  // Data rows
  let currentRow = headerRowIndex + 1
  for (const row of args.rows) {
    const r = worksheet.getRow(currentRow)
    r.values = [''].concat(row.map((cell) => normalizeCell(cell) as any))
    r.alignment = { vertical: 'top', horizontal: 'left', wrapText: true }
    currentRow += 1
  }

  if (args.summaryRows?.length) {
    currentRow += 1
    for (const row of args.summaryRows) {
      const r = worksheet.getRow(currentRow)
      r.values = [''].concat(row.map((cell) => normalizeCell(cell) as any))
      r.font = { bold: true, color: { argb: 'FF0F172A' } }
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
      r.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
      currentRow += 1
    }
  }

  // Column widths (skip the first empty helper column).
  const allRowsForWidth: Array<Array<string | number>> = [args.headers, ...args.rows, ...(args.summaryRows || [])]
  const widths = computeColWidths(allRowsForWidth)
  worksheet.getColumn(1).width = 2
  widths.forEach((wch, idx) => {
    worksheet.getColumn(idx + 2).width = Math.max(10, Math.min(60, wch))
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
