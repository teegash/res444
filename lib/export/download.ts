'use client'

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

export type ExportColumn<T> = {
  header: string
  accessor: (row: T) => string | number | null | undefined
  width?: number
  align?: 'left' | 'right' | 'center'
}

type PdfOptions = {
  title?: string
  subtitle?: string
  footerNote?: string
}

const BRAND_PRIMARY_RGB: [number, number, number] = [37, 99, 235] // #2563eb
const BRAND_ACCENT_RGB: [number, number, number] = [241, 245, 249]
const BRAND_DARK = '#0f172a'
const BRAND_MUTED = '#475569'
const PAGE_MARGIN = 48

function drawPremiumHeader(doc: jsPDF, title?: string, subtitle?: string) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const headerHeight = 90
  doc.setFillColor(...BRAND_PRIMARY_RGB)
  doc.rect(0, 0, pageWidth, headerHeight, 'F')

  doc.setTextColor('#ffffff')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text(title || 'RentalKenya Report', PAGE_MARGIN, 50)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  if (subtitle) {
    doc.text(subtitle, PAGE_MARGIN, 70)
  }
  doc.text(`Generated • ${new Date().toLocaleString()}`, pageWidth - PAGE_MARGIN, 70, {
    align: 'right',
  })

  return headerHeight
}

function drawFooter(doc: jsPDF, footerNote?: string) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const footerY = pageHeight - 30

  doc.setTextColor(BRAND_MUTED)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(10)

  if (footerNote) {
    doc.text(footerNote, PAGE_MARGIN, footerY, {
      maxWidth: pageWidth - PAGE_MARGIN * 2,
    })
  }

  doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageWidth - PAGE_MARGIN, footerY, {
    align: 'right',
  })
}

function normalizeValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    return value
  }
  return value
}

function downloadBlob(filename: string, blob: Blob) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(link.href), 0)
}

export function exportRowsAsCSV<T>(filename: string, columns: ExportColumn<T>[], data: T[]) {
  const headers = columns.map((col) => col.header)
  const rows = data.map((row) =>
    columns.map((col) => {
      const value = normalizeValue(col.accessor(row))
      if (typeof value === 'number') {
        return value.toString()
      }
      const needsQuotes = /[",\n]/.test(value)
      const sanitized = value.replace(/"/g, '""')
      return needsQuotes ? `"${sanitized}"` : sanitized
    })
  )

  const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')
  downloadBlob(filename.endsWith('.csv') ? filename : `${filename}.csv`, new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }))
}

export function exportRowsAsExcel<T>(filename: string, columns: ExportColumn<T>[], data: T[]) {
  const aoa = [
    columns.map((col) => col.header),
    ...data.map((row) => columns.map((col) => normalizeValue(col.accessor(row)))),
  ]
  const worksheet = XLSX.utils.aoa_to_sheet(aoa)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report')
  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, { compression: true })
}

export function exportRowsAsPDF<T>(
  filename: string,
  columns: ExportColumn<T>[],
  data: T[],
  options?: PdfOptions
) {
  const doc = new jsPDF({
    unit: 'pt',
    format: 'a4',
  })

  const headerHeight = drawPremiumHeader(doc, options?.title, options?.subtitle)
  let cursorY = headerHeight + 30

  autoTable(doc, {
    startY: cursorY,
    theme: 'striped',
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    head: [columns.map((col) => col.header)],
    body: data.map((row) => columns.map((col) => normalizeValue(col.accessor(row)))),
    styles: {
      fontSize: 10,
      cellPadding: 6,
      font: 'helvetica',
    },
    headStyles: {
      fillColor: BRAND_PRIMARY_RGB,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left',
    },
    bodyStyles: {
      halign: 'left',
      textColor: BRAND_DARK,
      fillColor: BRAND_ACCENT_RGB,
      lineColor: [226, 232, 240],
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    columnStyles: columns.reduce<Record<number, { halign: 'left' | 'right' | 'center' }>>((acc, col, index) => {
      if (col.align) {
        acc[index] = { halign: col.align }
      }
      return acc
    }, {}),
    stylesAlign: 'left',
  })

  drawFooter(doc, options?.footerNote)

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
}
