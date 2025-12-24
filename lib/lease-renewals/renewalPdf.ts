import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

type RenewalPdfInput = {
  organization: {
    name: string
    location?: string | null
    phone?: string | null
    email?: string | null
    address?: string | null
  }
  renewal: {
    id: string
    createdAtISO: string
  }
  lease: {
    id: string
    startDate?: string | null
    endDate?: string | null
    monthlyRent?: number | null
    depositAmount?: number | null
  }
  tenant: {
    id: string
    name: string
    phone?: string | null
    email?: string | null
  }
  premises: {
    buildingName?: string | null
    buildingLocation?: string | null
    unitNumber?: string | null
  }
  renewalTerm: {
    months: number
    startDateISO: string
    endDateISO: string
  }
}

const BRAND_PRIMARY = rgb(72 / 255, 103 / 255, 164 / 255) // #4867A4
const INK = rgb(15 / 255, 23 / 255, 42 / 255)
const MUTED = rgb(71 / 255, 85 / 255, 105 / 255)

function formatDateLabel(value: string | null | undefined) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' })
}

function moneyLabel(value: number | null | undefined) {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n) || n === 0) return 'KES —'
  return n.toLocaleString('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 })
}

function wrapText(text: string, font: any, size: number, maxWidth: number) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    const width = font.widthOfTextAtSize(next, size)
    if (width <= maxWidth) {
      current = next
      continue
    }
    if (current) lines.push(current)
    current = word
  }
  if (current) lines.push(current)
  return lines
}

export async function generateKenyanLeaseRenewalPdf(input: RenewalPdfInput) {
  const doc = await PDFDocument.create()
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  const pageSize: [number, number] = [595.28, 841.89] // A4
  const marginX = 46
  const headerHeight = 66
  const footerHeight = 44

  type Cursor = { page: any; y: number }
  const pages: any[] = []

  const newPage = () => {
    const page = doc.addPage(pageSize)
    pages.push(page)
    drawHeader(page)
    return { page, y: pageSize[1] - headerHeight - 22 } satisfies Cursor
  }

  const drawHeader = (page: any) => {
    page.drawRectangle({
      x: 0,
      y: pageSize[1] - headerHeight,
      width: pageSize[0],
      height: headerHeight,
      color: BRAND_PRIMARY,
    })

    page.drawText(input.organization.name || 'Organization', {
      x: marginX,
      y: pageSize[1] - 34,
      size: 18,
      font: fontBold,
      color: rgb(1, 1, 1),
    })

    page.drawText('Property Management', {
      x: marginX,
      y: pageSize[1] - 54,
      size: 11,
      font: fontRegular,
      color: rgb(1, 1, 1),
    })
  }

  const ensureSpace = (cursor: Cursor, needed: number) => {
    if (cursor.y - needed > footerHeight + 20) return cursor
    return newPage()
  }

  const drawHeading = (cursor: Cursor, text: string) => {
    const size = 12
    const cursorWithSpace = ensureSpace(cursor, 22)
    cursorWithSpace.page.drawText(text, {
      x: marginX,
      y: cursorWithSpace.y,
      size,
      font: fontBold,
      color: INK,
    })
    return { ...cursorWithSpace, y: cursorWithSpace.y - 18 }
  }

  const drawParagraph = (cursor: Cursor, text: string, opts?: { size?: number; color?: any }) => {
    const size = opts?.size ?? 10
    const maxWidth = pageSize[0] - marginX * 2
    const lines = wrapText(text, fontRegular, size, maxWidth)
    let c = cursor
    for (const line of lines) {
      c = ensureSpace(c, 16)
      c.page.drawText(line, { x: marginX, y: c.y, size, font: fontRegular, color: opts?.color ?? INK })
      c = { ...c, y: c.y - 14 }
    }
    return { ...c, y: c.y - 4 }
  }

  const drawKeyValueRow = (cursor: Cursor, left: string, right: string) => {
    const size = 10
    const maxWidth = pageSize[0] - marginX * 2
    const split = Math.floor(maxWidth * 0.55)
    const leftLines = wrapText(left, fontRegular, size, split)
    const rightLines = wrapText(right, fontRegular, size, maxWidth - split)
    const lines = Math.max(leftLines.length, rightLines.length)
    let c = ensureSpace(cursor, lines * 14 + 10)
    for (let i = 0; i < lines; i += 1) {
      const y = c.y - i * 14
      if (leftLines[i]) c.page.drawText(leftLines[i], { x: marginX, y, size, font: fontBold, color: MUTED })
      if (rightLines[i]) c.page.drawText(rightLines[i], { x: marginX + split, y, size, font: fontRegular, color: INK })
    }
    return { ...c, y: c.y - lines * 14 - 8 }
  }

  const drawSignatureBlock = (cursor: Cursor) => {
    let c = ensureSpace(cursor, 170)
    c.page.drawText('Signature Blocks (Digital)', { x: marginX, y: c.y, size: 11, font: fontBold, color: INK })
    c = { ...c, y: c.y - 18 }

    const boxW = (pageSize[0] - marginX * 2 - 20) / 2
    const boxH = 92
    const leftX = marginX
    const rightX = marginX + boxW + 20
    const boxY = c.y - boxH

    c.page.drawRectangle({ x: leftX, y: boxY, width: boxW, height: boxH, borderWidth: 1, borderColor: rgb(0.86, 0.9, 0.94) })
    c.page.drawText('Tenant', { x: leftX + 12, y: c.y - 22, size: 10, font: fontBold, color: INK })
    c.page.drawText('Digital signature will be applied after you click “Sign”.', { x: leftX + 12, y: c.y - 40, size: 9, font: fontRegular, color: MUTED, maxWidth: boxW - 24 })
    c.page.drawText('Field: TenantSignature', { x: leftX + 12, y: c.y - 62, size: 8.5, font: fontRegular, color: MUTED })

    c.page.drawRectangle({ x: rightX, y: boxY, width: boxW, height: boxH, borderWidth: 1, borderColor: rgb(0.86, 0.9, 0.94) })
    c.page.drawText('Landlord / Manager', { x: rightX + 12, y: c.y - 22, size: 10, font: fontBold, color: INK })
    c.page.drawText('Countersignature will be applied by management.', { x: rightX + 12, y: c.y - 40, size: 9, font: fontRegular, color: MUTED, maxWidth: boxW - 24 })
    c.page.drawText('Field: ManagerSignature', { x: rightX + 12, y: c.y - 62, size: 8.5, font: fontRegular, color: MUTED })

    return { ...c, y: boxY - 14 }
  }

  let cursor = newPage()

  cursor = drawHeading(cursor, 'LEASE RENEWAL AGREEMENT (REPUBLIC OF KENYA)')
  cursor = drawParagraph(
    cursor,
    'This Lease Renewal Agreement (“Renewal Agreement”) is made and entered into electronically. It renews and varies certain terms of the existing tenancy/lease between the parties for the premises described below.',
    { size: 10.5 }
  )

  cursor = drawKeyValueRow(cursor, 'Renewal ID', input.renewal.id)
  cursor = drawKeyValueRow(cursor, 'Original Lease ID', input.lease.id)
  cursor = drawKeyValueRow(cursor, 'Generated', formatDateLabel(input.renewal.createdAtISO))

  cursor = drawHeading(cursor, '1) Parties')
  cursor = drawKeyValueRow(cursor, 'Landlord / Agent (Management)', input.organization.name)
  const orgContact = [
    input.organization.location ? `Location: ${input.organization.location}` : null,
    input.organization.phone ? `Tel: ${input.organization.phone}` : null,
    input.organization.email ? `Email: ${input.organization.email}` : null,
  ]
    .filter(Boolean)
    .join(' | ')
  if (orgContact) cursor = drawParagraph(cursor, orgContact, { size: 9.5, color: MUTED })
  cursor = drawKeyValueRow(cursor, 'Tenant', input.tenant.name)
  const tenantContact = [
    input.tenant.phone ? `Tel: ${input.tenant.phone}` : null,
    input.tenant.email ? `Email: ${input.tenant.email}` : null,
  ]
    .filter(Boolean)
    .join(' | ')
  if (tenantContact) cursor = drawParagraph(cursor, tenantContact, { size: 9.5, color: MUTED })

  cursor = drawHeading(cursor, '2) Premises')
  cursor = drawKeyValueRow(cursor, 'Property', input.premises.buildingName || '—')
  if (input.premises.buildingLocation) cursor = drawKeyValueRow(cursor, 'Property Location', input.premises.buildingLocation)
  cursor = drawKeyValueRow(cursor, 'Unit', input.premises.unitNumber || '—')

  cursor = drawHeading(cursor, '3) Renewal Term')
  cursor = drawKeyValueRow(cursor, 'Renewal Start Date', formatDateLabel(input.renewalTerm.startDateISO))
  cursor = drawKeyValueRow(cursor, 'Renewal End Date', formatDateLabel(input.renewalTerm.endDateISO))
  cursor = drawKeyValueRow(cursor, 'Term', `${input.renewalTerm.months} months`)
  cursor = drawParagraph(
    cursor,
    'Except as amended by this Renewal Agreement, all terms and conditions of the original lease remain in full force and effect.',
    { size: 10 }
  )

  cursor = drawHeading(cursor, '4) Rent, Charges & Payment')
  cursor = drawParagraph(
    cursor,
    `The monthly rent payable for the premises is ${moneyLabel(input.lease.monthlyRent)} (unless varied in writing by management). Rent is due on or before the 1st day of each month unless otherwise agreed.`,
    { size: 10 }
  )
  cursor = drawParagraph(
    cursor,
    'Payments shall be made using the approved payment channels provided by management. The tenant is responsible for ensuring accurate payment references are used.',
    { size: 10 }
  )

  cursor = drawHeading(cursor, '5) Security Deposit')
  cursor = drawParagraph(
    cursor,
    `The security deposit on the existing lease is ${moneyLabel(input.lease.depositAmount)} (or as previously agreed). Unless otherwise stated, the deposit shall continue to be held under the original lease terms and will not be treated as rent.`,
    { size: 10 }
  )

  cursor = drawHeading(cursor, '6) Repairs, Maintenance & Utilities')
  cursor = drawParagraph(
    cursor,
    'The tenant shall keep the premises in a clean and tenantable condition and promptly report material defects to management. Management will attend to structural repairs and major maintenance unless damage is caused by the tenant, their guests, or negligence.',
    { size: 10 }
  )
  cursor = drawParagraph(
    cursor,
    'Utilities and service charges (including but not limited to water, electricity, refuse collection, and internet) shall be handled in accordance with the original lease and any applicable building policies.',
    { size: 10 }
  )

  cursor = drawHeading(cursor, '7) Termination & Notice')
  cursor = drawParagraph(
    cursor,
    'Either party may terminate the renewed tenancy by giving not less than thirty (30) days written notice, subject to the terms of the original lease and applicable laws of Kenya.',
    { size: 10 }
  )
  cursor = drawParagraph(
    cursor,
    'Upon termination or expiry, the tenant shall peacefully hand over vacant possession of the premises and return all keys/access devices, subject to a final inspection.',
    { size: 10 }
  )

  cursor = drawHeading(cursor, '8) Governing Law & Dispute Resolution')
  cursor = drawParagraph(
    cursor,
    'This Renewal Agreement shall be governed by and construed in accordance with the laws of the Republic of Kenya. The parties shall first attempt to resolve disputes amicably through negotiation. Where unresolved, disputes may be referred to mediation and/or the courts of competent jurisdiction in Kenya.',
    { size: 10 }
  )

  cursor = drawHeading(cursor, '9) Electronic Signatures & Audit Trail')
  cursor = drawParagraph(
    cursor,
    'By clicking “Sign” in the tenant portal, the tenant confirms intent to sign this Renewal Agreement. The platform will apply a digital signature certificate on behalf of the tenant and record an audit trail (timestamp, user identity, and device details). Management will countersign using a separate certificate.',
    { size: 10 }
  )
  cursor = drawParagraph(
    cursor,
    'A digitally signed PDF is the authoritative record. If any information is disputed, contact management immediately.',
    { size: 10 }
  )

  cursor = drawSignatureBlock(cursor)

  // Footer & page numbers
  const pageCount = pages.length
  pages.forEach((page, idx) => {
    const pageNumber = idx + 1
    const pageLabel = `Page ${pageNumber} of ${pageCount}`
    const pageLabelWidth = fontRegular.widthOfTextAtSize(pageLabel, 9)
    page.drawText(pageLabel, {
      x: pageSize[0] - marginX - pageLabelWidth,
      y: 18,
      size: 9,
      font: fontRegular,
      color: MUTED,
    })
    page.drawText(`Renewal ID: ${input.renewal.id}`, {
      x: marginX,
      y: 18,
      size: 9,
      font: fontRegular,
      color: MUTED,
    })
  })

  return await doc.save()
}
