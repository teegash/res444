import { NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function fetchImageBuffer(url: string) {
  try {
    const res = await fetch(url, { cache: 'force-cache' })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return { buf, contentType }
  } catch {
    return null
  }
}

async function coerceImageToPdfkitBuffer(image: { buf: Buffer; contentType: string }) {
  const type = image.contentType.toLowerCase()
  if (type.includes('png') || type.includes('jpeg') || type.includes('jpg')) return image.buf
  if (type.includes('webp')) {
    try {
      const mod = await import('sharp')
      const sharp = (mod as any).default || mod
      return await sharp(image.buf).png().toBuffer()
    } catch {
      return null
    }
  }
  return null
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatCurrency(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(value)
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const adminSupabase = createAdminClient()
    const [{ data: membership }, { data: profile }] = await Promise.all([
      adminSupabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle(),
      adminSupabase
        .from('user_profiles')
        .select('id, full_name, phone_number, address, organization_id')
        .eq('id', user.id)
        .maybeSingle(),
    ])

    const orgId = membership?.organization_id || (profile as any)?.organization_id || null
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'Organization not found.' }, { status: 403 })
    }

    const [{ data: organization }, { data: lease, error: leaseError }] = await Promise.all([
      adminSupabase
        .from('organizations')
        .select('id, name, logo_url, location, phone_number')
        .eq('id', orgId)
        .maybeSingle(),
      adminSupabase
        .from('leases')
        .select(
          `
          id,
          start_date,
          end_date,
          monthly_rent,
          deposit_amount,
          status,
          lease_agreement_url,
          rent_auto_populated,
          rent_locked_reason,
          lease_auto_generated,
          created_at,
          updated_at,
          unit:apartment_units (
            id,
            unit_number,
            floor,
            number_of_bedrooms,
            number_of_bathrooms,
            size_sqft,
            building:apartment_buildings (
              id,
              name,
              location
            )
          )
        `
        )
        .eq('tenant_user_id', user.id)
        .eq('organization_id', orgId)
        .in('status', ['active', 'pending'])
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (leaseError) {
      throw leaseError
    }

    if (!lease) {
      return NextResponse.json(
        { success: false, error: 'No active lease found.' },
        { status: 404 }
      )
    }

    const doc = new PDFDocument({ margin: 50 })
    const chunks: Uint8Array[] = []
    doc.on('data', (chunk) => chunks.push(chunk))

    const title = 'Residential Lease Summary'
    const orgName = organization?.name || 'RES'
    const logoUrl = organization?.logo_url || null

    const drawHeader = async (withLogo: boolean) => {
      const pageWidth = doc.page.width

      doc.save()
      doc.rect(0, 0, pageWidth, 70).fill('#2563EB')
      doc.roundedRect(50, 18, 34, 34, 6).fill('#FFFFFF')
      doc.roundedRect(50, 18, 34, 34, 6).stroke('#E2E8F0')

      if (withLogo && logoUrl) {
        const img = await fetchImageBuffer(logoUrl)
        if (img?.buf) {
          const usable = await coerceImageToPdfkitBuffer(img)
          if (usable) {
            try {
              doc.image(usable, 51, 19, { width: 32, height: 32 })
            } catch {
              // ignore
            }
          }
        }
      }

      doc
        .fillColor('#FFFFFF')
        .fontSize(16)
        .font('Helvetica-Bold')
        .text(orgName, 94, 40, { width: pageWidth - 160, ellipsis: true })

      doc.restore()

      doc
        .moveDown(2.6)
        .fontSize(16)
        .fillColor('#111827')
        .font('Helvetica-Bold')
        .text(title, { align: 'left' })
        .moveDown(0.25)
        .fontSize(10)
        .fillColor('#6B7280')
        .font('Helvetica')
        .text(`Generated: ${new Date().toLocaleString()}`)
        .moveDown(0.8)
    }

    await drawHeader(true)
    doc.on('pageAdded', () => {
      // Best-effort header for next pages (logo may be skipped).
      void drawHeader(false)
    })

    doc
      .fontSize(12)
      .fillColor('#4B5563')
      .text(`Generated for: ${profile?.full_name || 'Tenant'}`)
      .text(`Email: ${user.email || '—'}`)
      .text(`Phone: ${profile?.phone_number || '—'}`)
      .text(`Address: ${profile?.address || '—'}`)
      .moveDown()

    const addSection = (heading: string) => {
      doc.moveDown(0.5)
      doc
        .fontSize(13)
        .fillColor('#111827')
        .text(heading, { underline: true })
        .moveDown(0.2)
    }

    const addRow = (label: string, value?: string) => {
      doc
        .fontSize(11)
        .fillColor('#374151')
        .text(`${label}: `, { continued: true })
        .fillColor('#111827')
        .text(value || '—')
    }

    addSection('Property Details')
    addRow('Property', lease.unit?.building?.name || '—')
    addRow('Location', lease.unit?.building?.location || '—')
    addRow('Unit', lease.unit?.unit_number || '—')
    addRow('Floor', lease.unit?.floor?.toString() || '—')
    addRow('Bedrooms', lease.unit?.number_of_bedrooms?.toString() || '—')
    addRow('Bathrooms', lease.unit?.number_of_bathrooms?.toString() || '—')
    addRow('Size (sqft)', lease.unit?.size_sqft?.toString() || '—')

    addSection('Lease Terms')
    addRow('Lease ID', lease.id)
    addRow('Status', lease.status || '—')
    addRow('Start Date', formatDate(lease.start_date))
    addRow('End Date', formatDate(lease.end_date))
    addRow('Monthly Rent', formatCurrency(lease.monthly_rent))
    addRow('Security Deposit', formatCurrency(lease.deposit_amount))
    addRow('Auto-generated', lease.lease_auto_generated ? 'Yes' : 'No')
    addRow('Rent Auto-populated', lease.rent_auto_populated ? 'Yes' : 'No')
    if (lease.rent_locked_reason) {
      addRow('Rent Lock Reason', lease.rent_locked_reason)
    }

    addSection('Document References')
    addRow('Uploaded Agreement', lease.lease_agreement_url ? 'Available' : 'Not provided')
    addRow('Created', formatDate(lease.created_at))
    addRow('Last Updated', formatDate(lease.updated_at))

    doc.moveDown()
    doc
      .fontSize(10)
      .fillColor('#6B7280')
      .text(
        'This PDF is an automatically generated summary of your lease agreement. For clarifications or official amendments, contact your property manager.',
        { align: 'left' }
      )

    doc.end()

    await new Promise((resolve) => doc.on('end', resolve))
    const pdfBuffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=lease-summary-${lease.id}.pdf`,
      },
    })
  } catch (error) {
    console.error('[TenantLeasePDF] Failed to generate PDF', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate lease PDF.',
      },
      { status: 500 }
    )
  }
}
