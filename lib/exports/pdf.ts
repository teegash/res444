'use client'

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { LetterheadMeta } from './letterhead'
import { buildLetterheadLines, formatGeneratedAt, safeFilename } from './letterhead'
import { EXPORT_THEME } from './theme'

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

const PAGE_MARGIN_X = EXPORT_THEME.page.marginX
const FOOTER_HEIGHT = EXPORT_THEME.page.footerHeight

const TEXT_RGB = EXPORT_THEME.colors.text
const MUTED_RGB = EXPORT_THEME.colors.muted
const SUBTLE_RGB = EXPORT_THEME.colors.subtle
const BORDER_RGB = EXPORT_THEME.colors.border
const HEADER_FILL_RGB = EXPORT_THEME.colors.headerFill
const ZEBRA_RGB = EXPORT_THEME.colors.zebraFill
const SUMMARY_FILL_RGB = EXPORT_THEME.colors.summaryFill
const ACCENT_RGB = EXPORT_THEME.colors.accent

function resolveOrientation(option: PdfExportTableOptions['orientation'], columnCount: number) {
  if (option === 'portrait' || option === 'landscape') return option
  return columnCount > 6 ? 'landscape' : 'portrait'
}

function computeHeaderHeight(meta: LetterheadMeta, subtitle?: string) {
  const { left, right } = buildLetterheadLines(meta)
  const lineCount = Math.max(left.length, right.length)
  const extraSubtitle = subtitle ? 1 : 0
  const hasLogo = Boolean(meta.organizationLogoDataUrl || meta.organizationLogoUrl)
  const base = hasLogo ? 150 : 130
  return base + lineCount * 16 + extraSubtitle * 20
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
  void accentColor
  void ACCENT_RGB
  const headerTop = EXPORT_THEME.page.headerTopPad
  const rightX = pageWidth - PAGE_MARGIN_X

  const logoDataUrl = meta.organizationLogoDataUrl
  const orgName = meta.organizationName || 'Organization'

  const inferImageFormat = (dataUrl: string) => {
    if (dataUrl.startsWith('data:image/png')) return 'PNG'
    if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG'
    if (dataUrl.startsWith('data:image/webp')) return 'WEBP'
    return 'PNG'
  }

  let titleStartY = headerTop + 48
  if (logoDataUrl) {
    try {
      const logoHeight = 32
      const logoWidth = 120
      doc.addImage(logoDataUrl, inferImageFormat(logoDataUrl), PAGE_MARGIN_X, headerTop, logoWidth, logoHeight)
      titleStartY = headerTop + logoHeight + 30
    } catch {
      // ignore logo rendering errors
    }
  } else {
    doc.setTextColor(...TEXT_RGB)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(EXPORT_THEME.pdf.orgSize)
    doc.text(orgName, PAGE_MARGIN_X, headerTop + 24, {
      maxWidth: pageWidth - PAGE_MARGIN_X * 2,
    })
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(EXPORT_THEME.pdf.metaSize)
  doc.setTextColor(...MUTED_RGB)
  doc.text(`Generated: ${formatGeneratedAt(meta.generatedAtISO)}`, rightX, headerTop + 18, {
    align: 'right',
  })

  doc.setTextColor(...TEXT_RGB)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(EXPORT_THEME.pdf.titleSize)
  doc.text(meta.documentTitle || 'Document', PAGE_MARGIN_X, titleStartY)

  let cursorY = titleStartY + 24
  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...SUBTLE_RGB)
    doc.text(subtitle, PAGE_MARGIN_X, cursorY, {
      maxWidth: pageWidth - PAGE_MARGIN_X * 2,
    })
    cursorY += 20
  }

  const { left, right } = buildLetterheadLines(meta)
  const lines = Math.max(left.length, right.length)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...TEXT_RGB)

  for (let i = 0; i < lines; i += 1) {
    const leftText = left[i]
    const rightText = right[i]
    if (leftText) {
      doc.text(leftText, PAGE_MARGIN_X, cursorY)
    }
    if (rightText) {
      doc.text(rightText, pageWidth - PAGE_MARGIN_X, cursorY, { align: 'right' })
    }
    cursorY += 16
  }

  doc.setDrawColor(...BORDER_RGB)
  doc.setLineWidth(0.6)
  const lineY = Math.max(headerHeight - 8, cursorY + 6)
  doc.line(PAGE_MARGIN_X, lineY, pageWidth - PAGE_MARGIN_X, lineY)
}

export function getLetterheadHeight(meta: LetterheadMeta, subtitle?: string) {
  return computeHeaderHeight(meta, subtitle)
}

function drawFooter(doc: jsPDF, meta: LetterheadMeta, footerNote?: string) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const y = pageHeight - 24

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED_RGB)

  const orgName = meta.organizationName || 'Organization'
  doc.text(`Generated by ${orgName} System`, PAGE_MARGIN_X, y)

  if (footerNote) {
    doc.text(footerNote, PAGE_MARGIN_X + 170, y, {
      maxWidth: pageWidth - PAGE_MARGIN_X * 2 - 240,
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
  const firstPageTop = headerHeight + 36
  const followupTop = Math.max(44, EXPORT_THEME.page.headerTopPad + 18)
  const margin = {
    left: PAGE_MARGIN_X,
    right: PAGE_MARGIN_X,
    top: firstPageTop,
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
      fontSize: EXPORT_THEME.pdf.bodySize,
      cellPadding: EXPORT_THEME.pdf.table.cellPadding,
      overflow: 'linebreak',
      cellWidth: 'wrap',
      valign: 'top',
      textColor: TEXT_RGB as any,
      lineColor: BORDER_RGB as any,
      lineWidth: EXPORT_THEME.pdf.table.lineWidth,
      ...(options.tableStyles || {}),
    },
    headStyles: {
      fillColor: HEADER_FILL_RGB as any,
      textColor: TEXT_RGB as any,
      fontStyle: 'bold',
      ...(options.tableStyles?.fontSize ? { fontSize: options.tableStyles.fontSize } : {}),
    },
    alternateRowStyles: {
      fillColor: ZEBRA_RGB as any,
    },
    didParseCell: (data) => {
      const col = options.columns[data.column.index]
      if (col?.align) {
        data.cell.styles.halign = col.align
      }

      if (data.section === 'body' && data.row.index >= summaryStartIndex) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = SUMMARY_FILL_RGB as any
      }
    },
    willDrawPage: (data) => {
      if (data.pageNumber !== 1) return
      drawLetterhead(doc, {
        meta: options.meta,
        subtitle: options.subtitle,
        headerHeight,
      })
    },
    didDrawPage: (data) => {
      if (data.pageNumber === 1) {
        data.settings.margin.top = followupTop
      }
      drawFooter(doc, options.meta, options.footerNote)
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
