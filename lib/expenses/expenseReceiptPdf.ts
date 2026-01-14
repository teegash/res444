'use client'

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fetchCurrentOrganizationBrand } from '@/lib/exports/letterhead'
import type { LetterheadMeta } from '@/lib/exports/letterhead'
import { drawLetterhead, getLetterheadHeight } from '@/lib/exports/pdf'

type ExpenseReceiptPdfPayload = {
  expense: {
    id: string
    amount: number
    category: string | null
    incurred_at?: string | null
    created_at?: string | null
    notes?: string | null
    reference?: string | null
  }
  property?: {
    property_name: string | null
  } | null
}

const PAGE_MARGIN = 48
const EXPENSE_ORANGE: [number, number, number] = [234, 88, 12]

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

function safeDateLabel(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString()
}

function safeMoney(value: number) {
  const amount = Number(value || 0)
  return `KES ${amount.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`
}

export async function downloadExpenseReceiptPdf(receipt: ExpenseReceiptPdfPayload) {
  const org = await fetchCurrentOrganizationBrand()
  const orgLogoDataUrl = await fetchLogoDataUrl(org?.logo_url ?? null)
  const meta: LetterheadMeta = {
    organizationName: org?.name || 'RES',
    organizationLocation: org?.location ?? undefined,
    organizationPhone: org?.phone ?? undefined,
    organizationLogoDataUrl: orgLogoDataUrl ?? null,
    propertyName: receipt.property?.property_name || undefined,
    documentTitle: 'Expense Receipt',
    generatedAtISO: new Date().toISOString(),
  }
  const headerHeight = getLetterheadHeight(meta, undefined)

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  const drawHeader = () => {
    if (doc.internal.getNumberOfPages() !== 1) return
    drawLetterhead(doc, { meta, headerHeight, accentColor: EXPENSE_ORANGE })
  }

  drawHeader()

  const expenseDate =
    safeDateLabel(receipt.expense.incurred_at) ||
    safeDateLabel(receipt.expense.created_at)

  doc.setTextColor('#0f172a')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(safeMoney(receipt.expense.amount), PAGE_MARGIN, headerHeight + 34)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Expense Recorded', PAGE_MARGIN, headerHeight + 52)

  const reference = receipt.expense.reference || receipt.expense.id
  const propertyLabel = receipt.property?.property_name || '—'

  autoTable(doc, {
    startY: headerHeight + 74,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'grid',
    head: [['Field', 'Value']],
    body: [
      ['Date', expenseDate || '—'],
      ['Category', receipt.expense.category || 'Uncategorized'],
      ['Reference', reference],
      ['Property', propertyLabel],
      ['Notes', receipt.expense.notes || '—'],
    ],
    styles: {
      fontSize: 10,
      cellPadding: 6,
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
    },
    headStyles: {
      fillColor: EXPENSE_ORANGE as any,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 140, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
    },
  })

  const description = receipt.expense.notes || receipt.expense.category || 'Expense'

  autoTable(doc, {
    startY: (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 18 : 420,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'striped',
    head: [['Description', 'Amount']],
    body: [[description, safeMoney(receipt.expense.amount)]],
    styles: {
      fontSize: 10,
      cellPadding: 6,
      lineColor: [226, 232, 240],
    },
    headStyles: {
      fillColor: EXPENSE_ORANGE as any,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 120, halign: 'right' },
    },
  })

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9)
  doc.setTextColor('#475569')
  doc.text(
    'This receipt is computer generated and valid without a signature.',
    PAGE_MARGIN,
    doc.internal.pageSize.getHeight() - 36,
    { maxWidth: pageWidth - PAGE_MARGIN * 2 }
  )

  doc.save(`expense-receipt-${receipt.expense.id.slice(0, 8).toLowerCase()}.pdf`)
}
