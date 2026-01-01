import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { resolveRange, safePct } from "../utils"

type Row = {
  propertyId: string
  propertyName: string

  billed: number
  collected: number
  collectionRate: number

  arrearsNow: number

  occupancyRate: number
  unitCount: number
  occupiedLikeCount: number

  expenses: number
  noi: number
  noiMargin: number
}

function isoDate(value: string | null | undefined) {
  if (!value) return null
  return value.length >= 10 ? value.slice(0, 10) : null
}

function monthStartUtc(dateIso: string) {
  const d = new Date(`${dateIso.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

function addMonthsUtc(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const period = url.searchParams.get("period") || "year"
    const propertyId = url.searchParams.get("propertyId") || "all"
    const startDate = url.searchParams.get("startDate")
    const endDate = url.searchParams.get("endDate")

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const admin = createAdminClient()

    const { data: membership, error: membershipError } = await admin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle()

    if (membershipError || !membership?.organization_id) {
      return NextResponse.json({ success: false, error: "Organization not found." }, { status: 403 })
    }

    const orgId = membership.organization_id
    const range = resolveRange({ period, startDate, endDate })
    const scopePropertyId = propertyId !== "all" ? propertyId : null
    const rangeStartTs = range.start ? new Date(`${range.start}T00:00:00Z`).toISOString() : null
    const rangeEndExclusiveTs = (() => {
      const end = new Date(`${range.end}T00:00:00Z`)
      end.setUTCDate(end.getUTCDate() + 1)
      return end.toISOString()
    })()

    /* =========================================================
       1) Properties
    ========================================================= */
    const { data: properties, error: propErr } = await admin
      .from("apartment_buildings")
      .select("id, name")
      .eq("organization_id", orgId)
      .order("name", { ascending: true })
    if (propErr) throw propErr

    const propertyMap = new Map((properties || []).map((p: any) => [p.id, p.name || "Property"]))

    /* =========================================================
       2) Units => occupancy + counts
    ========================================================= */
    let unitQuery = admin
      .from("apartment_units")
      .select("id, status, building_id")
      .eq("organization_id", orgId)

    if (scopePropertyId) unitQuery = unitQuery.eq("building_id", scopePropertyId)

    const { data: units, error: unitErr } = await unitQuery
    if (unitErr) throw unitErr

    const occupancyByProperty = new Map<string, { total: number; occupiedLike: number }>()
    ;(units || []).forEach((u: any) => {
      const pid = u.building_id
      if (!pid) return
      const entry = occupancyByProperty.get(pid) || { total: 0, occupiedLike: 0 }
      entry.total += 1
      const status = String(u.status || "").toLowerCase()
      if (status === "occupied" || status === "notice") entry.occupiedLike += 1
      occupancyByProperty.set(pid, entry)
    })

    /* =========================================================
       3) Base rows map
    ========================================================= */
    const rowsMap = new Map<string, Row>()
    ;(properties || []).forEach((p: any) => {
      rowsMap.set(p.id, {
        propertyId: p.id,
        propertyName: p.name || "Property",

        billed: 0,
        collected: 0,
        collectionRate: 0,

        arrearsNow: 0,

        occupancyRate: 0,
        unitCount: 0,
        occupiedLikeCount: 0,

        expenses: 0,
        noi: 0,
        noiMargin: 0,
      })
    })

    const ensureRow = (pid: string, name?: string | null) => {
      if (!rowsMap.has(pid)) {
        rowsMap.set(pid, {
          propertyId: pid,
          propertyName: name || propertyMap.get(pid) || "Property",
          billed: 0,
          collected: 0,
          collectionRate: 0,
          arrearsNow: 0,
          occupancyRate: 0,
          unitCount: 0,
          occupiedLikeCount: 0,
          expenses: 0,
          noi: 0,
          noiMargin: 0,
        })
      }
      return rowsMap.get(pid)!
    }

    /* =========================================================
       4) Invoices (Billed + Arrears source)
       - Primary bucket: period_start (canonical).
       - Fallback: due_date only when period_start is null.
    ========================================================= */
    let invoiceQuery = admin
      .from("invoices")
      .select(
        `
        id,
        amount,
        total_paid,
        status_text,
        due_date,
        created_at,
        period_start,
        invoice_type,
        lease:leases!invoices_lease_org_fk (
          unit:apartment_units (
            building:apartment_buildings!apartment_units_building_org_fk ( id, name )
          )
        )
      `
      )
      .eq("organization_id", orgId)
      .in("invoice_type", ["rent", "water"])
      .gt("amount", 0)
      .not("period_start", "is", null)

    if (range.start) invoiceQuery = invoiceQuery.gte("period_start", range.start)
    invoiceQuery = invoiceQuery.lte("period_start", range.end)

    const { data: invoicesWithPeriod, error: invErr } = await invoiceQuery
    if (invErr) throw invErr

    let fallbackInvoiceQuery = admin
      .from("invoices")
      .select(
        `
        id,
        amount,
        total_paid,
        status_text,
        due_date,
        created_at,
        period_start,
        invoice_type,
        lease:leases!invoices_lease_org_fk (
          unit:apartment_units (
            building:apartment_buildings!apartment_units_building_org_fk ( id, name )
          )
        )
      `
      )
      .eq("organization_id", orgId)
      .in("invoice_type", ["rent", "water"])
      .gt("amount", 0)
      .is("period_start", null)

    if (rangeStartTs) fallbackInvoiceQuery = fallbackInvoiceQuery.gte("created_at", rangeStartTs)
    fallbackInvoiceQuery = fallbackInvoiceQuery.lt("created_at", rangeEndExclusiveTs)

    const { data: invoicesWithDueDate, error: fallbackErr } = await fallbackInvoiceQuery
    if (fallbackErr) throw fallbackErr

    const invoicesRaw = [...(invoicesWithPeriod || []), ...(invoicesWithDueDate || [])]

    const scopedInvoices = scopePropertyId
      ? invoicesRaw.filter((inv: any) => inv.lease?.unit?.building?.id === scopePropertyId)
      : invoicesRaw

    for (const inv of scopedInvoices) {
      if (String(inv.status_text || "").toLowerCase() === "void") continue
      const pid = inv.lease?.unit?.building?.id
      if (!pid) continue
      const row = ensureRow(pid, inv.lease?.unit?.building?.name)
      row.billed += Number(inv.amount || 0)
    }

    /* =========================================================
       5) Payments (Collected)
       - Canonical reporting date: payment_date (your preference).
       - Must be verified.
       - Must map to property via invoice->lease->unit->building.
       - Must match invoice_type rent/water, and invoice not void.
    ========================================================= */
    let paymentsQuery = admin
      .from("payments")
      .select(
        `
        amount_paid,
        payment_date,
        verified,
        invoice:invoices!payments_invoice_org_fk (
          invoice_type,
          status_text,
          lease:leases!invoices_lease_org_fk (
            unit:apartment_units (
              building:apartment_buildings!apartment_units_building_org_fk ( id, name )
            )
          )
        )
      `
      )
      .eq("organization_id", orgId)
      .eq("verified", true)

    if (range.start) paymentsQuery = paymentsQuery.gte("payment_date", range.start)
    paymentsQuery = paymentsQuery.lte("payment_date", range.end)

    const { data: paymentsRaw, error: payErr } = await paymentsQuery
    if (payErr) throw payErr

    const scopedPayments = scopePropertyId
      ? (paymentsRaw || []).filter((p: any) => p.invoice?.lease?.unit?.building?.id === scopePropertyId)
      : paymentsRaw || []

    for (const p of scopedPayments) {
      const invType = String(p.invoice?.invoice_type || "").toLowerCase()
      const invStatus = String(p.invoice?.status_text || "").toLowerCase()
      if (invStatus === "void") continue
      if (invType && invType !== "rent" && invType !== "water") continue

      const pid = p.invoice?.lease?.unit?.building?.id
      if (!pid) continue
      const row = ensureRow(pid, p.invoice?.lease?.unit?.building?.name)
      row.collected += Number(p.amount_paid || 0)
    }

    /* =========================================================
       6) Expenses + recurring_expenses expanded across months (same as Overview)
    ========================================================= */
    const { data: expensesRaw, error: expensesError } = await admin
      .from("expenses")
      .select("id, amount, incurred_at, created_at, property_id, organization_id")
      .eq("organization_id", orgId)
    if (expensesError) throw expensesError

    const expenses = (expensesRaw || []).filter((item: any) => {
      const date = isoDate(item.incurred_at) || isoDate(item.created_at)
      if (!date) return false
      if (range.start && date < range.start) return false
      return date <= range.end
    })

    const scopedExpenses = scopePropertyId
      ? expenses.filter((item: any) => item.property_id === scopePropertyId)
      : expenses

    const { data: recurringExpenses, error: recurringError } = await admin
      .from("recurring_expenses")
      .select("id, property_id, amount, next_run, active")
      .eq("organization_id", orgId)
      .eq("active", true)
    if (recurringError) throw recurringError

    const recurringEntries: Array<{ property_id: string | null; amount: number; incurred_at: string }> = []
    const rangeStartIso = range.start || range.end
    const startMonth = rangeStartIso ? monthStartUtc(rangeStartIso) : null
    const endMonth = monthStartUtc(range.end)

    if (startMonth && endMonth) {
      for (const recurring of recurringExpenses || []) {
        const nextRunIso = recurring?.next_run ? String(recurring.next_run).slice(0, 10) : null
        const nextRunMonth = nextRunIso ? monthStartUtc(nextRunIso) : null
        let cursor = nextRunMonth && nextRunMonth > startMonth ? nextRunMonth : startMonth

        while (cursor <= endMonth) {
          recurringEntries.push({
            property_id: recurring.property_id || null,
            amount: Number(recurring.amount || 0),
            incurred_at: cursor.toISOString(),
          })
          cursor = addMonthsUtc(cursor, 1)
        }
      }
    }

    const scopedRecurringEntries = scopePropertyId
      ? recurringEntries.filter((e) => e.property_id === scopePropertyId)
      : recurringEntries

    const combinedExpenses = [...scopedExpenses, ...scopedRecurringEntries]

    for (const e of combinedExpenses) {
      const pid = e.property_id
      if (!pid) continue
      const row = ensureRow(pid, propertyMap.get(pid))
      row.expenses += Number(e.amount || 0)
    }

    /* =========================================================
       7) Arrears Now (Overview-style)
       - overdue (due_date < today) and unpaid (status_text != 'paid'), not void
       - We do NOT reference partial-payment logic.
    ========================================================= */
    const todayIso = new Date().toISOString().slice(0, 10)

    const arrearsSource = scopedInvoices

    for (const inv of arrearsSource) {
      const due = isoDate(inv.due_date)
      if (!due) continue
      if (due >= todayIso) continue

      const st = String(inv.status_text || "").toLowerCase()
      if (st === "paid" || st === "void") continue

      const pid = inv.lease?.unit?.building?.id
      if (!pid) continue
      const row = ensureRow(pid, inv.lease?.unit?.building?.name)
      row.arrearsNow += Number(inv.amount || 0)
    }

    /* =========================================================
       8) Apply occupancy counts + derived metrics
    ========================================================= */
    for (const [pid, entry] of occupancyByProperty.entries()) {
      const row = ensureRow(pid, propertyMap.get(pid))
      row.unitCount = entry.total
      row.occupiedLikeCount = entry.occupiedLike
      row.occupancyRate = entry.total ? safePct(entry.occupiedLike, entry.total) : 0
    }

    const rows = Array.from(rowsMap.values())
      .map((row) => {
        row.collectionRate = safePct(row.collected, row.billed)
        row.noi = row.collected - row.expenses
        row.noiMargin = safePct(row.noi, row.collected)
        return row
      })
      .filter((row) => (scopePropertyId ? row.propertyId === scopePropertyId : true))

    /* =========================================================
       9) Benchmarks
    ========================================================= */
    const rateSource = rows.filter((r) => r.billed > 0)
    const rates = (rateSource.length ? rateSource : rows).map((r) => r.collectionRate)

    const medianCollectionRate = median(rates)
    const avgCollectionRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0

    const topProperty = rows.length
      ? rows.reduce((best, r) => (r.collectionRate > best.collectionRate ? r : best), rows[0])
      : null

    const bottomProperty = rows.length
      ? rows.reduce((worst, r) => (r.collectionRate < worst.collectionRate ? r : worst), rows[0])
      : null

    const spread =
      topProperty && bottomProperty ? topProperty.collectionRate - bottomProperty.collectionRate : 0

    const underperformers = rows.filter((r) => r.collectionRate < medianCollectionRate).length

    return NextResponse.json({
      success: true,
      data: {
        range,
        properties: properties || [],
        benchmarks: {
          medianCollectionRate,
          avgCollectionRate,
          topProperty: topProperty ? { name: topProperty.propertyName, rate: topProperty.collectionRate } : null,
          bottomProperty: bottomProperty ? { name: bottomProperty.propertyName, rate: bottomProperty.collectionRate } : null,
          spread,
          underperformers,
        },
        rows,
      },
    })
  } catch (error) {
    console.error("[BenchmarkReport] Failed", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load benchmark report.",
      },
      { status: 500 }
    )
  }
}
