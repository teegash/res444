import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export async function buildKenyanLeaseRenewalPdf(args: {
  renewalId: string
  leaseId: string
  organizationName: string
  propertyName?: string | null
  unitNumber?: string | null
  tenantName?: string | null
  tenantNationalId?: string | null
  startDate?: string | null
  endDate?: string | null
  monthlyRent?: number | null
}) {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595.28, 841.89]) // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const left = 50
  let y = 800

  const draw = (text: string, size = 10, isBold = false) => {
    page.drawText(text, { x: left, y, size, font: isBold ? bold : font, color: rgb(0, 0, 0) })
    y -= size + 6
  }

  const money = (n?: number | null) =>
    typeof n === 'number' && !Number.isNaN(n)
      ? new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(n)
      : '—'

  draw(args.organizationName || 'RES', 14, true)
  draw('LEASE RENEWAL AGREEMENT (KENYA)', 13, true)
  y -= 6

  draw(`Renewal ID: ${args.renewalId}`)
  draw(`Lease ID: ${args.leaseId}`)
  if (args.propertyName || args.unitNumber) {
    draw(`Premises: ${args.propertyName || '—'}  |  Unit: ${args.unitNumber || '—'}`)
  }
  if (args.tenantName) {
    draw(`Tenant: ${args.tenantName}${args.tenantNationalId ? `  |  ID: ${args.tenantNationalId}` : ''}`)
  }
  draw(`Current Term: ${args.startDate || '—'} to ${args.endDate || '—'}`)
  draw(`Monthly Rent: ${money(args.monthlyRent)}`)

  y -= 10
  draw('1. Renewal', 11, true)
  draw(
    'The Landlord/Agent and the Tenant agree to renew the lease for the premises described above, subject to the terms in this document and the existing lease (as amended).'
  )

  y -= 6
  draw('2. Term', 11, true)
  draw(
    'The renewal term shall commence on the day immediately following the expiry of the current term, unless otherwise agreed in writing by both parties.'
  )

  y -= 6
  draw('3. Rent & Charges', 11, true)
  draw(
    'The Tenant shall continue to pay rent and any applicable charges (including utilities, service charge, penalties, and other lawful fees) as communicated by management.'
  )

  y -= 6
  draw('4. Notice & Termination', 11, true)
  draw(
    'Either party may terminate the tenancy by giving the other party at least thirty (30) days written notice, unless a longer period is required by law or the existing lease.'
  )

  y -= 6
  draw('5. Governing Law', 11, true)
  draw('This renewal shall be governed by the laws of the Republic of Kenya.')

  // Signature blocks (visual guides only)
  page.drawLine({ start: { x: left, y: 145 }, end: { x: 260, y: 145 }, thickness: 1 })
  page.drawLine({ start: { x: 320, y: 145 }, end: { x: 545, y: 145 }, thickness: 1 })
  page.drawText('Tenant Digital Signature', { x: left, y: 155, size: 10, font: bold })
  page.drawText('Landlord/Manager Digital Signature', { x: 320, y: 155, size: 10, font: bold })

  const bytes = await pdfDoc.save()
  return Buffer.from(bytes)
}

