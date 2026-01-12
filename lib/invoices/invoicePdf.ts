'use client'

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export type InvoicePdfInput = {
  // Header (right)
  logoBytes?: Uint8Array
  orgEmail?: string
  orgPhone?: string

  // Header (left)
  invoiceId: string
  periodLabel: string
  statusLabel?: string

  // Bill-to section
  tenantName: string
  tenantEmail: string
  propertyName: string
  unitNumber: string
  dueDateLabel: string

  // Line items
  rentAmount: number
  arrearsAmount?: number
  lineItemLabel?: string

  // Footer (optional)
  paybillNumber?: string
  accountNumber?: string
  bankName?: string
  bankAccount?: string

  // Display tweaks
  currencyPrefix?: string
}

function fmtMoney(prefix: string, n: number) {
  const v = Number.isFinite(n) ? n : 0
  return `${prefix} ${v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

function shortId(id: string) {
  const s = String(id || '')
  return s.length <= 8 ? s : s.slice(0, 8)
}

export async function buildInvoicePdfBytes(input: InvoicePdfInput): Promise<Uint8Array> {
  const currency = input.currencyPrefix ?? 'KES'
  const rent = Number(input.rentAmount || 0)
  const arrears = Math.max(0, Number(input.arrearsAmount || 0))
  const totalDue = Math.max(0, rent + arrears)
  const lineItemLabel = input.lineItemLabel ?? 'Monthly Rent'
  const statusText = input.statusLabel ? String(input.statusLabel).toUpperCase() : null

  const pdf = await PDFDocument.create()

  try {
    pdf.setTitle(`Invoice ${input.periodLabel}`)
    pdf.setAuthor('RES')
    pdf.setSubject(`Invoice for ${input.propertyName} Unit ${input.unitNumber}`)
    pdf.setProducer('RES (pdf-lib)')
    pdf.setCreator('RES')
  } catch {
    // ignore
  }

  const page = pdf.addPage([595.28, 841.89])
  const { width, height } = page.getSize()

  const ink = rgb(0.07, 0.09, 0.12)
  const muted = rgb(0.38, 0.43, 0.5)
  const faint = rgb(0.6, 0.65, 0.72)
  const rule = rgb(0.86, 0.88, 0.92)
  const soft = rgb(0.97, 0.98, 0.99)
  const statusPaidBg = rgb(0.9, 0.97, 0.92)
  const statusPaidText = rgb(0.12, 0.54, 0.32)
  const statusUnpaidBg = rgb(0.99, 0.92, 0.92)
  const statusUnpaidText = rgb(0.75, 0.18, 0.2)

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) })

  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const M = 52
  const rightX = width - M

  const textWidth = (text: string, size: number, font: any) =>
    font.widthOfTextAtSize(String(text || ''), size)

  const drawRule = (yy: number) => {
    page.drawLine({
      start: { x: M, y: yy },
      end: { x: width - M, y: yy },
      thickness: 1,
      color: rule,
    })
  }

  const drawRightText = (text: string, xRight: number, yy: number, size: number, font: any, color: any) => {
    const w = textWidth(text, size, font)
    page.drawText(String(text || ''), { x: xRight - w, y: yy, size, font, color })
  }

  const drawCenteredText = (text: string, centerX: number, yy: number, size: number, font: any, color: any) => {
    const w = textWidth(text, size, font)
    page.drawText(String(text || ''), { x: centerX - w / 2, y: yy, size, font, color })
  }

  const wrapText = (text: string, maxW: number, size: number, font: any) => {
    const words = String(text || '').split(/\s+/).filter(Boolean)
    const lines: string[] = []
    let cur = ''
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w
      if (textWidth(t, size, font) <= maxW) cur = t
      else {
        if (cur) lines.push(cur)
        cur = w
      }
    }
    if (cur) lines.push(cur)
    return lines
  }

  const yTop = height - 56
  let y = yTop

  page.drawText('Invoice', { x: M, y, size: 18, font: fontBold, color: ink })
  if (statusText) {
    const badgeTextSize = 9.5
    const badgePadX = 6
    const badgePadY = 3
    const badgeTextWidth = textWidth(statusText, badgeTextSize, fontBold)
    const badgeW = badgeTextWidth + badgePadX * 2
    const badgeH = badgeTextSize + badgePadY * 2
    const badgeX = M + textWidth('Invoice', 18, fontBold) + 10
    const badgeY = y - badgeH + 4
    const isPaid = statusText === 'PAID'
    const badgeBg = isPaid ? statusPaidBg : statusUnpaidBg
    const badgeInk = isPaid ? statusPaidText : statusUnpaidText

    page.drawRectangle({ x: badgeX, y: badgeY, width: badgeW, height: badgeH, color: badgeBg })
    page.drawText(statusText, {
      x: badgeX + badgePadX,
      y: badgeY + badgePadY,
      size: badgeTextSize,
      font: fontBold,
      color: badgeInk,
    })
  }

  page.drawText(`Invoice ID: ${shortId(input.invoiceId)}`, {
    x: M,
    y: y - 18,
    size: 9.5,
    font: fontRegular,
    color: muted,
  })

  page.drawText(`Period: ${input.periodLabel}`, {
    x: M,
    y: y - 32,
    size: 9.5,
    font: fontRegular,
    color: muted,
  })

  let contactAnchorY = y

  if (input.logoBytes && input.logoBytes.length > 0) {
    try {
      let img: any
      try {
        img = await pdf.embedPng(input.logoBytes)
      } catch {
        img = await pdf.embedJpg(input.logoBytes)
      }

      const dims = img.scale(1)
      const targetH = 34
      const scale = targetH / dims.height
      const targetW = dims.width * scale

      const logoX = rightX - targetW
      const logoY = y - 2

      page.drawImage(img, { x: logoX, y: logoY, width: targetW, height: targetH })
      contactAnchorY = logoY
    } catch {
      // ignore logo failures
    }
  }

  const orgLines = [
    input.orgEmail ? `Email: ${input.orgEmail}` : null,
    input.orgPhone ? `Tel: ${input.orgPhone}` : null,
  ].filter(Boolean) as string[]

  let orgY = contactAnchorY - 16
  for (const line of orgLines) {
    drawRightText(line, rightX, orgY, 9, fontRegular, muted)
    orgY -= 12
  }

  const leftBottom = y - 46
  const rightBottom = orgY + 6
  const headerDividerY = Math.min(leftBottom, rightBottom) - 10

  y = headerDividerY
  drawRule(y)

  y -= 28

  page.drawText(input.tenantName, { x: M, y, size: 11, font: fontBold, color: ink })
  page.drawText(input.tenantEmail, { x: M, y: y - 14, size: 9.5, font: fontRegular, color: muted })
  page.drawText(`${input.propertyName} - Unit ${input.unitNumber}`, {
    x: M,
    y: y - 28,
    size: 9.5,
    font: fontRegular,
    color: muted,
  })

  const centerX = width / 2
  page.drawText('Due Date', { x: centerX - 22, y, size: 9, font: fontBold, color: muted })
  drawCenteredText(String(input.dueDateLabel), centerX, y - 16, 12.5, fontBold, ink)

  const paymentBoxRight = rightX
  page.drawText('Payment Terms', {
    x: paymentBoxRight - textWidth('Payment Terms', 9, fontBold),
    y,
    size: 9,
    font: fontBold,
    color: muted,
  })
  drawRightText('Payable on receipt', paymentBoxRight, y - 16, 9.5, fontRegular, ink)

  y -= 52
  drawRule(y)

  y -= 26

  const tableX = M
  const tableW = width - M * 2

  const xNo = tableX + 0
  const xDesc = tableX + 60

  const xAmountRight = tableX + tableW
  const amountColW = 110
  const unitColW = 110
  const qtyColW = 40
  const gap = 18

  const xAmountLeft = xAmountRight - amountColW
  const xUnitRight = xAmountLeft - gap
  const xUnitLeft = xUnitRight - unitColW

  const xQtyRight = xUnitLeft - gap
  const xQtyLeft = xQtyRight - qtyColW

  const descMaxW = xQtyLeft - xDesc - 10

  page.drawText('No.', { x: xNo, y, size: 9, font: fontBold, color: muted })
  page.drawText('Description', { x: xDesc, y, size: 9, font: fontBold, color: muted })
  drawRightText('Qty', xQtyRight, y, 9, fontBold, muted)
  drawRightText('Unit Price', xUnitRight, y, 9, fontBold, muted)
  drawRightText('Amount', xAmountRight, y, 9, fontBold, muted)

  y -= 12
  drawRule(y)
  y -= 18

  const rows: Array<{ no: string; desc: string; qty: number; unitPrice: number; amount: number }> = [
    { no: '1', desc: `${lineItemLabel} (${input.periodLabel})`, qty: 1, unitPrice: rent, amount: rent },
    { no: '2', desc: 'Arrears (Outstanding Balance)', qty: 1, unitPrice: arrears, amount: arrears },
  ].filter((r) => r.amount > 0 || r.no === '1')

  for (const r of rows) {
    page.drawText(r.no, { x: xNo, y, size: 10, font: fontRegular, color: ink })

    const descLines = wrapText(r.desc, descMaxW, 10, fontRegular)
    let yy = y
    for (const ln of descLines) {
      page.drawText(ln, { x: xDesc, y: yy, size: 10, font: fontRegular, color: ink })
      yy -= 12
    }

    drawRightText(String(r.qty), xQtyRight, y, 10, fontRegular, ink)
    drawRightText(fmtMoney(currency, r.unitPrice), xUnitRight, y, 10, fontRegular, ink)
    drawRightText(fmtMoney(currency, r.amount), xAmountRight, y, 10, fontRegular, ink)

    const rowH = Math.max(22, descLines.length * 12)
    y -= rowH
    drawRule(y)
    y -= 14
  }

  const totalsRight = width - M
  const totalsH = 72
  const padX = 10

  const labelText = 'Total Due:'
  const labelSize = 11

  const amountText = fmtMoney(currency, totalDue)

  let amountSize = 22
  const hardMaxW = 320
  while (amountSize > 12 && textWidth(amountText, amountSize, fontBold) > hardMaxW) {
    amountSize -= 0.5
  }

  const labelW = textWidth(labelText, labelSize, fontBold)
  const amountW = textWidth(amountText, amountSize, fontBold)

  let totalsW = Math.max(labelW, amountW) + padX * 2
  totalsW = Math.max(200, Math.min(totalsW, 340))

  const totalsLeft = totalsRight - totalsW

  page.drawRectangle({
    x: totalsLeft,
    y: y - totalsH,
    width: totalsW,
    height: totalsH,
    color: soft,
    borderColor: rule,
    borderWidth: 1,
  })

  const contentX = totalsLeft + padX

  const amountY = y - totalsH + 18
  const labelYIdeal = amountY + amountSize + 6
  const labelTopLimit = y - 20
  const labelY = Math.min(labelYIdeal, labelTopLimit)

  page.drawText(labelText, { x: contentX, y: labelY, size: labelSize, font: fontBold, color: ink })
  page.drawText(amountText, { x: contentX, y: amountY, size: amountSize, font: fontBold, color: ink })

  const footerY = 92
  const fGap = 18
  const fColW = (width - M * 2 - 2 * fGap) / 3

  const fx1 = M
  const fx2 = M + fColW + fGap
  const fx3 = M + (fColW + fGap) * 2

  page.drawText('Reference', { x: fx1, y: footerY + 28, size: 9, font: fontBold, color: muted })

  const refMaxW = fColW - 6
  const refFontSize = 6.5
  const refLines = wrapText(input.invoiceId, refMaxW, refFontSize, fontRegular).slice(0, 2)
  page.drawText(refLines[0] ?? '-', { x: fx1, y: footerY + 16, size: refFontSize, font: fontRegular, color: ink })
  if (refLines[1]) {
    page.drawText(refLines[1], { x: fx1, y: footerY + 8, size: refFontSize, font: fontRegular, color: ink })
  }

  page.drawText('Phone', { x: fx2, y: footerY + 28, size: 9, font: fontBold, color: muted })
  page.drawText(input.orgPhone ? input.orgPhone : '-', {
    x: fx2,
    y: footerY + 14,
    size: 9.5,
    font: fontRegular,
    color: ink,
  })

  if (input.paybillNumber) {
    page.drawText('M-Pesa Paybill', { x: fx2, y: footerY - 4, size: 9, font: fontBold, color: muted })
    page.drawText(String(input.paybillNumber), {
      x: fx2,
      y: footerY - 18,
      size: 9.5,
      font: fontRegular,
      color: ink,
    })

    if (input.accountNumber) {
      page.drawText('Account', { x: fx2, y: footerY - 36, size: 9, font: fontBold, color: muted })
      page.drawText(String(input.accountNumber), {
        x: fx2,
        y: footerY - 50,
        size: 9.5,
        font: fontRegular,
        color: ink,
      })
    }
  }

  page.drawText('Email', { x: fx3, y: footerY + 28, size: 9, font: fontBold, color: muted })
  page.drawText(input.orgEmail ? input.orgEmail : '-', {
    x: fx3,
    y: footerY + 14,
    size: 9.5,
    font: fontRegular,
    color: ink,
  })

  if (input.bankName) {
    page.drawText('Bank', { x: fx3, y: footerY - 4, size: 9, font: fontBold, color: muted })
    page.drawText(String(input.bankName), {
      x: fx3,
      y: footerY - 18,
      size: 9.5,
      font: fontRegular,
      color: ink,
    })

    if (input.bankAccount) {
      page.drawText('Account No.', { x: fx3, y: footerY - 36, size: 9, font: fontBold, color: muted })
      page.drawText(String(input.bankAccount), {
        x: fx3,
        y: footerY - 50,
        size: 9.5,
        font: fontRegular,
        color: ink,
      })
    }
  }

  page.drawText('Generated by RES System', { x: M, y: 34, size: 8.5, font: fontRegular, color: faint })
  drawRightText('Page 1 / 1', width - M, 34, 8.5, fontRegular, faint)

  return await pdf.save()
}

export async function downloadInvoicePdf(
  input: InvoicePdfInput,
  filename = `Invoice-${input.periodLabel}-${input.unitNumber}.pdf`
) {
  const bytes = await buildInvoicePdfBytes(input)
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()

  URL.revokeObjectURL(url)
}
