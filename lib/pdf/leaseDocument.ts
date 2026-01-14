import jsPDF from 'jspdf'
import type { LetterheadMeta } from '@/lib/exports/letterhead'
import { fetchCurrentOrganizationBrand } from '@/lib/exports/letterhead'
import { drawLetterhead, getLetterheadHeight } from '@/lib/exports/pdf'

type KeyValueRow = { label: string; value: string }

export interface LeasePdfSection {
  title: string
  rows: KeyValueRow[]
}

export interface LeasePdfOptions {
  fileName: string
  headerTitle: string
  headerSubtitle?: string
  summary: KeyValueRow[]
  sections: LeasePdfSection[]
  notes?: string[]
  letterhead?: Partial<LetterheadMeta>
  compact?: boolean
}

const DARK = '#0f172a'
const MUTED = '#475569'
const PAGE_MARGIN = 48

async function fetchLogoDataUrl(url?: string | null) {
  if (!url) return null
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

const ensureSpace = (
  doc: jsPDF,
  cursorY: number,
  heightNeeded: number,
  onNewPage: () => number
) => {
  const pageHeight = doc.internal.pageSize.getHeight()
  if (cursorY + heightNeeded > pageHeight - PAGE_MARGIN) {
    doc.addPage()
    return onNewPage()
  }
  return cursorY
}

const writeRow = (
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  config: { fontSize: number; lineHeight: number; wrapLineHeight: number }
) => {
  doc.setFontSize(config.fontSize)
  doc.setTextColor(MUTED)
  doc.text(`${label}:`, x, y)
  doc.setTextColor(DARK)
  const wrapped = doc.splitTextToSize(value || '—', maxWidth)
  doc.text(wrapped, x + 130, y, { maxWidth })
  return y + config.lineHeight + (wrapped.length > 1 ? config.wrapLineHeight * (wrapped.length - 1) : 0)
}

export async function exportLeasePdf(options: LeasePdfOptions) {
  const layout = {
    summaryRowHeight: options.compact ? 44 : 60,
    summaryMinHeight: options.compact ? 88 : 120,
    summaryLabelSize: options.compact ? 9 : 12,
    summaryValueSize: options.compact ? 10 : 12,
    sectionTitleSize: options.compact ? 12 : 15,
    sectionHeaderHeight: options.compact ? 44 : 60,
    sectionDividerGap: options.compact ? 10 : 16,
    rowHeight: options.compact ? 24 : 32,
    rowFontSize: options.compact ? 8 : 11,
    rowLineHeight: options.compact ? 12 : 18,
    rowWrapLineHeight: options.compact ? 9 : 12,
    summarySpacing: options.compact ? 16 : 24,
    noteHeaderHeight: options.compact ? 52 : 80,
    noteRowHeight: options.compact ? 24 : 40,
    noteTitleSize: options.compact ? 11 : 14,
    noteFontSize: options.compact ? 8 : 11,
    noteLineHeight: options.compact ? 11 : 14,
  }

  const org = await fetchCurrentOrganizationBrand()
  const orgLogoDataUrl = await fetchLogoDataUrl(org?.logo_url ?? null)
  const generatedAtISO = options.letterhead?.generatedAtISO || new Date().toISOString()

  const meta: LetterheadMeta = {
    organizationName: options.letterhead?.organizationName || org?.name || 'RES',
    organizationLocation: options.letterhead?.organizationLocation || (org?.location ?? undefined),
    organizationPhone: options.letterhead?.organizationPhone || (org?.phone ?? undefined),
    organizationLogoUrl:
      options.letterhead?.organizationLogoUrl !== undefined
        ? options.letterhead.organizationLogoUrl
        : org?.logo_url ?? null,
    organizationLogoDataUrl: orgLogoDataUrl ?? null,
    tenantName: options.letterhead?.tenantName,
    tenantPhone: options.letterhead?.tenantPhone,
    propertyName: options.letterhead?.propertyName,
    unitNumber: options.letterhead?.unitNumber,
    documentTitle: options.letterhead?.documentTitle || options.headerTitle || 'Lease Document',
    generatedAtISO,
  }

  const subtitle = options.headerSubtitle

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  const headerHeight = getLetterheadHeight(meta, subtitle)
  const drawHeader = () => {
    drawLetterhead(doc, { meta, subtitle, headerHeight })
    return headerHeight + 18
  }
  const newPageCursor = () => {
    drawHeader()
    return headerHeight + 18
  }

  let cursorY = drawHeader()

  // Summary card
  const summaryRows = Math.max(1, Math.ceil(options.summary.length / 2))
  const summaryHeight = Math.max(layout.summaryMinHeight, summaryRows * layout.summaryRowHeight)
  const summaryTop = cursorY
  const summaryWidth = pageWidth - PAGE_MARGIN * 2

  doc.setFillColor(255, 255, 255)
  doc.roundedRect(PAGE_MARGIN, summaryTop, summaryWidth, summaryHeight, 12, 12, 'F')
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(PAGE_MARGIN, summaryTop, summaryWidth, summaryHeight, 12, 12, 'S')
  doc.setFontSize(layout.summaryLabelSize)
  doc.setTextColor(DARK)

  const columnWidth = summaryWidth / 2
  options.summary.forEach((item, index) => {
    const column = index % 2
    const rowIndex = Math.floor(index / 2)
    const x = PAGE_MARGIN + column * columnWidth
    const yBase = summaryTop + 24 + rowIndex * layout.summaryRowHeight

    doc.setTextColor(MUTED)
    doc.text(item.label, x + 14, yBase)
    doc.setTextColor(DARK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(layout.summaryValueSize)
    const value = item.value || '—'
    const wrapped = doc.splitTextToSize(value, columnWidth - 40)
    doc.text(wrapped, x + 14, yBase + 18)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(layout.summaryLabelSize)
  })

  cursorY = summaryTop + summaryHeight + layout.summarySpacing

  options.sections.forEach((section) => {
    cursorY = ensureSpace(doc, cursorY, layout.sectionHeaderHeight, newPageCursor)
    doc.setFontSize(layout.sectionTitleSize)
    doc.setTextColor(DARK)
    doc.setFont('helvetica', 'bold')
    doc.text(section.title, PAGE_MARGIN, cursorY)
    cursorY += 12
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.8)
    doc.line(PAGE_MARGIN, cursorY, pageWidth - PAGE_MARGIN, cursorY)
    cursorY += layout.sectionDividerGap
    doc.setFont('helvetica', 'normal')

    section.rows.forEach((row) => {
      cursorY = ensureSpace(doc, cursorY, layout.rowHeight, newPageCursor)
      cursorY = writeRow(
        doc,
        row.label,
        row.value,
        PAGE_MARGIN,
        cursorY,
        pageWidth - PAGE_MARGIN * 2 - 140,
        {
          fontSize: layout.rowFontSize,
          lineHeight: layout.rowLineHeight,
          wrapLineHeight: layout.rowWrapLineHeight,
        }
      )
    })

    cursorY += 6
  })

  if (options.notes?.length) {
    cursorY = ensureSpace(doc, cursorY, layout.noteHeaderHeight, newPageCursor)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(layout.noteTitleSize)
    doc.setTextColor(DARK)
    doc.text('Notes', PAGE_MARGIN, cursorY)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(layout.noteFontSize)
    cursorY += layout.noteLineHeight + 4
    options.notes.forEach((note) => {
      cursorY = ensureSpace(doc, cursorY, layout.noteRowHeight, newPageCursor)
      const text = doc.splitTextToSize(`• ${note}`, pageWidth - PAGE_MARGIN * 2)
      doc.text(text, PAGE_MARGIN, cursorY)
      cursorY += text.length * layout.noteLineHeight + 4
    })
  }

  doc.setFontSize(10)
  doc.setTextColor(MUTED)
  doc.text(
    `${meta.organizationName || 'RES'} • Confidential document`,
    PAGE_MARGIN,
    doc.internal.pageSize.getHeight() - 24
  )

  doc.save(options.fileName.endsWith('.pdf') ? options.fileName : `${options.fileName}.pdf`)
}
