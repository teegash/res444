import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

type LeaseRenewalPdfInput = {
  organizationName: string
  organizationLocation?: string | null
  organizationPhone?: string | null
  tenantName: string
  tenantPhone?: string | null
  propertyName?: string | null
  propertyLocation?: string | null
  unitNumber?: string | null
  leaseId: string
  renewalId: string
  leaseStartDate?: string | null
  leaseEndDate?: string | null
  monthlyRent?: number | null
  depositAmount?: number | null
  generatedAtISO: string
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatMoney(value: number | null | undefined) {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n) || n <= 0) return 'KES —'
  return n.toLocaleString('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 })
}

export async function generateKenyanLeaseRenewalPdf(input: LeaseRenewalPdfInput) {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595.28, 841.89]) // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const left = 52
  const right = 543
  const topBarHeight = 56
  const brand = rgb(72 / 255, 103 / 255, 164 / 255) // #4867A4

  page.drawRectangle({ x: 0, y: 841.89 - topBarHeight, width: 595.28, height: topBarHeight, color: brand })
  page.drawText(input.organizationName || 'Organization', {
    x: left,
    y: 841.89 - 34,
    size: 18,
    font: fontBold,
    color: rgb(1, 1, 1),
  })
  page.drawText('Property Management', {
    x: left,
    y: 841.89 - 52,
    size: 11,
    font,
    color: rgb(1, 1, 1),
  })

  let y = 841.89 - topBarHeight - 26
  const line = (text: string, size = 10, bold = false) => {
    page.drawText(text, { x: left, y, size, font: bold ? fontBold : font, color: rgb(0.1, 0.09, 0.16) })
    y -= size + 6
  }

  const muted = rgb(0.28, 0.33, 0.41)
  const small = (text: string) => {
    page.drawText(text, { x: left, y, size: 9.5, font, color: muted })
    y -= 14
  }

  line('LEASE RENEWAL AGREEMENT (REPUBLIC OF KENYA)', 13, true)
  small(`Renewal ID: ${input.renewalId}`)
  small(`Original Lease ID: ${input.leaseId}`)
  small(`Generated: ${formatDate(input.generatedAtISO)}`)

  y -= 8
  line('1) Parties', 11, true)
  small(`Landlord / Agent (Management): ${input.organizationName}`)
  const orgParts = [
    input.organizationLocation ? `Location: ${input.organizationLocation}` : null,
    input.organizationPhone ? `Tel: ${input.organizationPhone}` : null,
  ].filter(Boolean)
  if (orgParts.length) small(orgParts.join('  |  '))
  small(`Tenant: ${input.tenantName}`)
  if (input.tenantPhone) small(`Tenant Tel: ${input.tenantPhone}`)

  y -= 8
  line('2) Premises', 11, true)
  small(`Property: ${input.propertyName || '—'}${input.propertyLocation ? ` (${input.propertyLocation})` : ''}`)
  small(`Unit: ${input.unitNumber || '—'}`)

  y -= 8
  line('3) Renewal Term', 11, true)
  small(`Current Lease Term: ${formatDate(input.leaseStartDate)} to ${formatDate(input.leaseEndDate)}`)
  small(
    'This Renewal Agreement renews the tenancy for a further term as communicated by management and accepted by the tenant through electronic signing.'
  )

  y -= 8
  line('4) Rent, Charges & Payment', 11, true)
  small(`Monthly Rent: ${formatMoney(input.monthlyRent)} (unless varied in writing).`)
  small('Rent is due on or before the 1st day of each month unless otherwise agreed in writing.')
  small('Payments shall be made via the approved payment channels provided by management.')

  y -= 8
  line('5) Security Deposit', 11, true)
  small(
    `Security Deposit: ${formatMoney(input.depositAmount)} (or as previously agreed). The deposit continues under the original lease terms and is not treated as rent.`
  )

  y -= 8
  line('6) Repairs, Maintenance & Utilities', 11, true)
  small(
    'The tenant shall keep the premises in a clean and tenantable condition and promptly report material defects to management. Management will attend to structural repairs and major maintenance unless damage is caused by the tenant, guests, or negligence.'
  )
  small(
    'Utilities and service charges (including but not limited to water, electricity, refuse collection, and internet) shall be handled in accordance with the original lease and applicable building policies.'
  )

  y -= 8
  line('7) Termination & Notice', 11, true)
  small(
    'Either party may terminate the renewed tenancy by giving not less than thirty (30) days written notice, subject to the terms of the original lease and applicable laws of Kenya.'
  )
  small('Upon termination or expiry, the tenant shall peacefully hand over vacant possession of the premises.')

  y -= 8
  line('8) Governing Law & Dispute Resolution', 11, true)
  small(
    'This Renewal Agreement is governed by the laws of the Republic of Kenya. The parties shall first attempt to resolve disputes amicably. Where unresolved, disputes may be referred to mediation and/or the courts of competent jurisdiction in Kenya.'
  )

  y -= 8
  line('9) Electronic Signatures & Audit Trail', 11, true)
  small(
    'By clicking “Sign” in the tenant portal, the tenant confirms intent to sign this Renewal Agreement. The platform applies a digital signature certificate on behalf of the tenant and records an audit trail (timestamp, user identity, and device details). Management will countersign using a separate certificate.'
  )

  // Signature blocks
  const sigTop = 168
  page.drawText('Tenant Digital Signature (Field: TenantSignature)', { x: left, y: sigTop, size: 10, font: fontBold })
  page.drawLine({ start: { x: left, y: sigTop - 18 }, end: { x: left + 220, y: sigTop - 18 }, thickness: 1 })
  page.drawText('Landlord / Manager Digital Signature (Field: ManagerSignature)', {
    x: left + 280,
    y: sigTop,
    size: 10,
    font: fontBold,
  })
  page.drawLine({ start: { x: left + 280, y: sigTop - 18 }, end: { x: right, y: sigTop - 18 }, thickness: 1 })

  // Footer
  page.drawText(`Renewal ID: ${input.renewalId}`, { x: left, y: 20, size: 9, font, color: muted })
  const pageLabel = 'Page 1 of 1'
  const labelWidth = font.widthOfTextAtSize(pageLabel, 9)
  page.drawText(pageLabel, { x: right - labelWidth, y: 20, size: 9, font, color: muted })

  return await pdfDoc.save()
}

