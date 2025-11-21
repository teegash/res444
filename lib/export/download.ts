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

  const marginLeft = 40
  let cursorY = 50

  if (options?.title) {
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text(options.title, marginLeft, cursorY)
    cursorY += 22
  }

  if (options?.subtitle) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.text(options.subtitle, marginLeft, cursorY)
    cursorY += 18
  }

  autoTable(doc, {
    startY: cursorY,
    head: [columns.map((col) => col.header)],
    body: data.map((row) => columns.map((col) => normalizeValue(col.accessor(row)))),
    styles: {
      fontSize: 10,
      cellPadding: 6,
    },
    headStyles: {
      fillColor: [16, 185, 129],
      halign: 'left',
    },
    bodyStyles: {
      halign: 'left',
    },
    columnStyles: columns.reduce<Record<number, { halign: 'left' | 'right' | 'center' }>>((acc, col, index) => {
      if (col.align) {
        acc[index] = { halign: col.align }
      }
      return acc
    }, {}),
    stylesAlign: 'left',
  })

  if (options?.footerNote) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'italic')
    doc.text(
      options.footerNote,
      marginLeft,
      doc.internal.pageSize.getHeight() - 30,
      {
        maxWidth: doc.internal.pageSize.getWidth() - marginLeft * 2,
      }
    )
  }

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
}
