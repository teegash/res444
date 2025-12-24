'use client'

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fetchCurrentOrganizationBrand } from '@/lib/exports/letterhead'
import type { LetterheadMeta } from '@/lib/exports/letterhead'
import { drawLetterhead, getLetterheadHeight } from '@/lib/exports/pdf'

type ReceiptPdfPayload = {
  payment: {
    id: string
    amount: number
    method: string | null
    status: string
    payment_date: string | null
    created_at: string | null
    mpesa_receipt_number: string | null
    bank_reference_number: string | null
    months_paid: number
    coverage_label: string
  }
  invoice?: {
    description: string | null
    type: string | null
    due_date: string | null
  } | null
  property?: {
    property_name: string | null
    unit_number: string | null
  } | null
  tenant: {
    name: string
    phone_number: string | null
  }
}

const PAGE_MARGIN = 48

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

export async function downloadReceiptPdf(receipt: ReceiptPdfPayload) {
  const org = await fetchCurrentOrganizationBrand()
  const meta: LetterheadMeta = {
    organizationName: org?.name || 'RES',
    organizationLocation: org?.location ?? undefined,
    organizationPhone: org?.phone ?? undefined,
    tenantName: receipt.tenant.name || undefined,
    tenantPhone: receipt.tenant.phone_number || undefined,
    propertyName: receipt.property?.property_name || undefined,
    unitNumber: receipt.property?.unit_number || undefined,
    documentTitle: 'Payment Receipt',
    generatedAtISO: new Date().toISOString(),
  }
  const headerHeight = getLetterheadHeight(meta, undefined)

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  const drawHeader = () => {
    drawLetterhead(doc, { meta, headerHeight })
  }

  drawHeader()

  const status = (receipt.payment.status || '').toLowerCase()
  const statusLabel =
    status === 'verified' ? 'VERIFIED' : status === 'failed' ? 'FAILED' : 'PENDING'

  doc.setTextColor('#0f172a')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(safeMoney(receipt.payment.amount), PAGE_MARGIN, headerHeight + 34)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Status: ${statusLabel}`, PAGE_MARGIN, headerHeight + 52)

  const reference =
    receipt.payment.mpesa_receipt_number ||
    receipt.payment.bank_reference_number ||
    receipt.payment.id

  const methodLabel = receipt.payment.method
    ? receipt.payment.method.replace(/_/g, ' ')
    : '—'

  const paymentDate =
    safeDateLabel(receipt.payment.payment_date) ||
    safeDateLabel(receipt.payment.created_at)

  const propertyLabel = [
    receipt.property?.property_name,
    receipt.property?.unit_number ? `Unit ${receipt.property.unit_number}` : null,
  ]
    .filter(Boolean)
    .join(' • ')

  const didDrawPage = () => {
    drawHeader()
  }

  autoTable(doc, {
    startY: headerHeight + 74,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'grid',
    head: [['Field', 'Value']],
    body: [
      ['Tenant', receipt.tenant.name || 'Tenant'],
      ['Phone', receipt.tenant.phone_number || '—'],
      ['Date', paymentDate || '—'],
      ['Method', methodLabel ? methodLabel.charAt(0).toUpperCase() + methodLabel.slice(1) : '—'],
      ['Reference', reference],
      ['Property', propertyLabel || '—'],
      ['Coverage', receipt.payment.coverage_label || '—'],
    ],
    styles: {
      fontSize: 10,
      cellPadding: 6,
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
    },
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 140, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
    },
    didDrawPage,
  })

  const description =
    receipt.invoice?.description ||
    (receipt.invoice?.type === 'water' ? 'Water bill payment' : 'Rent payment')

  autoTable(doc, {
    startY: (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 18 : 420,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'striped',
    head: [['Description', 'Amount']],
    body: [[description, safeMoney(receipt.payment.amount)]],
    styles: {
      fontSize: 10,
      cellPadding: 6,
      lineColor: [226, 232, 240],
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 120, halign: 'right' },
    },
    didDrawPage,
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

  doc.save(`receipt-${receipt.payment.id.slice(0, 8).toLowerCase()}.pdf`)
}
