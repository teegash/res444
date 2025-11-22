import jsPDF from 'jspdf'

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
}

const PRIMARY = [37, 99, 235]
const DARK = '#0f172a'
const MUTED = '#475569'
const PAGE_MARGIN = 48

const ensureSpace = (doc: jsPDF, cursorY: number, heightNeeded: number) => {
  const pageHeight = doc.internal.pageSize.getHeight()
  if (cursorY + heightNeeded > pageHeight - PAGE_MARGIN) {
    doc.addPage()
    return PAGE_MARGIN
  }
  return cursorY
}

const writeRow = (doc: jsPDF, label: string, value: string, x: number, y: number, maxWidth: number) => {
  doc.setFontSize(11)
  doc.setTextColor(MUTED)
  doc.text(`${label}:`, x, y)
  doc.setTextColor(DARK)
  const wrapped = doc.splitTextToSize(value || '—', maxWidth)
  doc.text(wrapped, x + 130, y, { maxWidth })
  return y + 18 + (wrapped.length > 1 ? 12 * (wrapped.length - 1) : 0)
}

export function exportLeasePdf(options: LeasePdfOptions) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  // Header
  const headerHeight = 120
  doc.setFillColor(...PRIMARY)
  doc.rect(0, 0, pageWidth, headerHeight, 'F')

  doc.setTextColor('#ffffff')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.text(options.headerTitle, PAGE_MARGIN, 60)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  if (options.headerSubtitle) {
    doc.text(options.headerSubtitle, PAGE_MARGIN, 80)
  }
  doc.text(`Generated on ${new Date().toLocaleString()}`, pageWidth - PAGE_MARGIN, 80, { align: 'right' })

  // Summary card
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(PAGE_MARGIN, headerHeight - 20, pageWidth - PAGE_MARGIN * 2, 100, 12, 12, 'F')
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(PAGE_MARGIN, headerHeight - 20, pageWidth - PAGE_MARGIN * 2, 100, 12, 12, 'S')
  doc.setFontSize(12)
  doc.setTextColor(DARK)

  const columnWidth = (pageWidth - PAGE_MARGIN * 2) / 2
  options.summary.forEach((item, index) => {
    const column = index % 2
    const rowIndex = Math.floor(index / 2)
    const x = PAGE_MARGIN + column * columnWidth
    const y = headerHeight + rowIndex * 18
    doc.setTextColor(MUTED)
    doc.text(item.label, x + 14, y + 14)
    doc.setTextColor(DARK)
    doc.setFont('helvetica', 'bold')
    doc.text(item.value || '—', x + 14, y + 32, { maxWidth: columnWidth - 28 })
    doc.setFont('helvetica', 'normal')
  })

  let cursorY = headerHeight + 110

  options.sections.forEach((section) => {
    cursorY = ensureSpace(doc, cursorY, 60)
    doc.setFontSize(15)
    doc.setTextColor(DARK)
    doc.setFont('helvetica', 'bold')
    doc.text(section.title, PAGE_MARGIN, cursorY)
    cursorY += 12
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.8)
    doc.line(PAGE_MARGIN, cursorY, pageWidth - PAGE_MARGIN, cursorY)
    cursorY += 16
    doc.setFont('helvetica', 'normal')

    section.rows.forEach((row) => {
      cursorY = ensureSpace(doc, cursorY, 32)
      cursorY = writeRow(doc, row.label, row.value, PAGE_MARGIN, cursorY, pageWidth - PAGE_MARGIN * 2 - 140)
    })

    cursorY += 6
  })

  if (options.notes?.length) {
    cursorY = ensureSpace(doc, cursorY, 80)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(DARK)
    doc.text('Notes', PAGE_MARGIN, cursorY)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    cursorY += 18
    options.notes.forEach((note) => {
      cursorY = ensureSpace(doc, cursorY, 40)
      const text = doc.splitTextToSize(`• ${note}`, pageWidth - PAGE_MARGIN * 2)
      doc.text(text, PAGE_MARGIN, cursorY)
      cursorY += text.length * 14 + 4
    })
  }

  doc.setFontSize(10)
  doc.setTextColor(MUTED)
  doc.text(
    'RentalKenya • Confidential tenant document',
    PAGE_MARGIN,
    doc.internal.pageSize.getHeight() - 24
  )

  doc.save(options.fileName.endsWith('.pdf') ? options.fileName : `${options.fileName}.pdf`)
}
