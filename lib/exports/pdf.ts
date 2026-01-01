'use client'

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { LetterheadMeta } from './letterhead'
import { buildLetterheadLines, formatGeneratedAt, safeFilename } from './letterhead'

export type PdfTableColumn = {
  header: string
  align?: 'left' | 'right' | 'center'
}

export type PdfExportTableOptions = {
  filenameBase: string
  meta: LetterheadMeta
  subtitle?: string
  columns: PdfTableColumn[]
  body: Array<Array<string | number>>
  summaryRows?: Array<Array<string | number>>
  footerNote?: string
  orientation?: 'portrait' | 'landscape' | 'auto'
  tableStyles?: Partial<{
    fontSize: number
    cellPadding: number | { top?: number; right?: number; bottom?: number; left?: number }
    lineHeightFactor: number
    overflow: 'linebreak' | 'ellipsize' | 'visible' | 'hidden'
  }>
}

// Brand primary: elegant blend of previous blue + #606975.
const BRAND_PRIMARY_RGB: [number, number, number] = [72, 103, 164] // #4867A4
const BRAND_DARK_RGB: [number, number, number] = [15, 23, 42]
const BRAND_MUTED_RGB: [number, number, number] = [71, 85, 105]
const BORDER_RGB: [number, number, number] = [226, 232, 240]

const PAGE_MARGIN_X = 40
const FOOTER_HEIGHT = 46

function resolveOrientation(option: PdfExportTableOptions['orientation'], columnCount: number) {
  if (option === 'portrait' || option === 'landscape') return option
  return columnCount > 6 ? 'landscape' : 'portrait'
}

function computeHeaderHeight(meta: LetterheadMeta, subtitle?: string) {
  const { left, right } = buildLetterheadLines(meta)
  const lineCount = Math.max(left.length, right.length)
  const extraSubtitle = subtitle ? 1 : 0
  const base = 84
  return base + (lineCount + extraSubtitle) * 12
}

export function drawLetterhead(
  doc: jsPDF,
  opts: {
    meta: LetterheadMeta
    subtitle?: string
    headerHeight: number
    accentColor?: [number, number, number]
  }
) {
  const { meta, subtitle, headerHeight, accentColor } = opts
  const pageWidth = doc.internal.pageSize.getWidth()
  const brandColor = accentColor || BRAND_PRIMARY_RGB

  // Top bar
  doc.setFillColor(...brandColor)
  doc.rect(0, 0, pageWidth, 52, 'F')

  // Org name
  doc.setTextColor('#ffffff')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(meta.organizationName || 'Organization', PAGE_MARGIN_X, 30, {
    maxWidth: pageWidth - PAGE_MARGIN_X * 2,
  })
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(11)
  doc.text('Property Management', PAGE_MARGIN_X, 44, {
    maxWidth: pageWidth - PAGE_MARGIN_X * 2,
  })

  // Title row
  doc.setTextColor(...BRAND_DARK_RGB)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(meta.documentTitle || 'Document', PAGE_MARGIN_X, 74)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...BRAND_MUTED_RGB)
  doc.text(`Generated: ${formatGeneratedAt(meta.generatedAtISO)}`, pageWidth - PAGE_MARGIN_X, 74, {
    align: 'right',
  })

  let cursorY = 92
  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...BRAND_MUTED_RGB)
    doc.text(subtitle, PAGE_MARGIN_X, cursorY, {
      maxWidth: pageWidth - PAGE_MARGIN_X * 2,
    })
    cursorY += 16
  }

  const { left, right } = buildLetterheadLines(meta)
  const lines = Math.max(left.length, right.length)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...BRAND_DARK_RGB)

  for (let i = 0; i < lines; i += 1) {
    const leftText = left[i]
    const rightText = right[i]
    if (leftText) {
      doc.text(leftText, PAGE_MARGIN_X, cursorY)
    }
    if (rightText) {
      doc.text(rightText, pageWidth - PAGE_MARGIN_X, cursorY, { align: 'right' })
    }
    cursorY += 12
  }

  // Divider line
  doc.setDrawColor(...BORDER_RGB)
  doc.line(PAGE_MARGIN_X, headerHeight - 12, pageWidth - PAGE_MARGIN_X, headerHeight - 12)
}

export function getLetterheadHeight(meta: LetterheadMeta, subtitle?: string) {
  return computeHeaderHeight(meta, subtitle)
}

function drawFooter(doc: jsPDF, footerNote?: string) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const y = pageHeight - 24

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...BRAND_MUTED_RGB)

  if (footerNote) {
    doc.text(footerNote, PAGE_MARGIN_X, y, {
      maxWidth: pageWidth - PAGE_MARGIN_X * 2 - 70,
    })
  }

  doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageWidth - PAGE_MARGIN_X, y, { align: 'right' })
}

export function exportTablePdf(options: PdfExportTableOptions) {
  const orientation = resolveOrientation(options.orientation, options.columns.length)
  const doc = new jsPDF({
    unit: 'pt',
    format: 'a4',
    orientation,
  })

  const headerHeight = computeHeaderHeight(options.meta, options.subtitle)
  const margin = {
    left: PAGE_MARGIN_X,
    right: PAGE_MARGIN_X,
    top: headerHeight + 8,
    bottom: FOOTER_HEIGHT,
  }

  const summaryStartIndex = options.body.length
  const rows = [...options.body, ...(options.summaryRows || [])]

  autoTable(doc, {
    margin,
    tableWidth: 'auto',
    pageBreak: 'auto',
    rowPageBreak: 'avoid',
    head: [options.columns.map((c) => c.header)],
    body: rows,
    styles: {
      font: 'helvetica',
      fontSize: 9.5,
      cellPadding: 5,
      overflow: 'linebreak',
      cellWidth: 'wrap',
      valign: 'top',
      textColor: BRAND_DARK_RGB as any,
      lineColor: BORDER_RGB as any,
      lineWidth: 0.5,
      ...(options.tableStyles || {}),
    },
    headStyles: {
      fillColor: BRAND_PRIMARY_RGB as any,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      ...(options.tableStyles?.fontSize ? { fontSize: options.tableStyles.fontSize } : {}),
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didParseCell: (data) => {
      // Align columns
      const col = options.columns[data.column.index]
      if (col?.align) {
        data.cell.styles.halign = col.align
      }

      // Summary rows
      if (data.section === 'body' && data.row.index >= summaryStartIndex) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = [241, 245, 249]
      }
    },
    didDrawPage: () => {
      drawLetterhead(doc, {
        meta: options.meta,
        subtitle: options.subtitle,
        headerHeight,
      })
      drawFooter(doc, options.footerNote)
    },
  })

  doc.save(`${safeFilename(options.filenameBase)}.pdf`)
}

function money(n: unknown) {
  const numberValue = Number(n ?? 0)
  return numberValue.toLocaleString('en-KE', { style: 'currency', currency: 'KES' })
}

/**
 * Convenience wrapper matching the statement-ledger shape (entry_date/entry_type/debit/credit/running_balance).
 * Prefer using `exportTablePdf` for custom reports.
 */
export async function exportStatementPdf(meta: LetterheadMeta, rows: any[]) {
  const filenameBase = safeFilename(meta.documentTitle || 'statement')

  const body = (rows || []).map((r: any) => [
    r.entry_date ?? r.posted_at ?? '',
    r.entry_type ?? r.type ?? '',
    r.description ?? '',
    r.debit ? money(r.debit) : '',
    r.credit ? money(r.credit) : '',
    money(r.running_balance ?? r.balance_after ?? r.balance ?? 0),
  ])

  exportTablePdf({
    filenameBase,
    meta,
    columns: [
      { header: 'Date' },
      { header: 'Type' },
      { header: 'Description' },
      { header: 'Debit', align: 'right' },
      { header: 'Credit', align: 'right' },
      { header: 'Balance', align: 'right' },
    ],
    body,
    footerNote:
      'Disclaimer: If any item on this statement is disputed, please contact management immediately.',
  })
}
