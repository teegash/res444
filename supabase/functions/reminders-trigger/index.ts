import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Candidate = {
  invoice_id: string;
  lease_id: string;
  organization_id: string;
  tenant_user_id: string;
  amount: number;
  due_date: string;        // YYYY-MM-DDd
  period_start: string;    // YYYY-MM-DD
  status_text: string | null;
  status: boolean | null;
  rent_paid_until: string | null; // YYYY-MM-DD
  lease_status: string | null;
  last_reminder_stage: number | null;
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const parseYMD = (s: string) => new Date(`${s}T00:00:00.000Z`);
const addDays = (d: Date, days: number) => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
};
const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const monthEnd = (d: Date) => addDays(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)), -1);

const datesEqual = (a: Date, b: Date) =>
  a.getUTCFullYear() === b.getUTCFullYear() &&
  a.getUTCMonth() === b.getUTCMonth() &&
  a.getUTCDate() === b.getUTCDate();

function isPaid(r: Candidate): boolean {
  if (r.status_text) return r.status_text === "paid";
  return r.status === true;
}

function isPrepaidForPeriod(r: Candidate): boolean {
  if (!r.rent_paid_until) return false;
  const paidUntil = parseYMD(r.rent_paid_until);
  const period = parseYMD(r.period_start);
  return paidUntil.getTime() >= period.getTime();
}

/**
 * Stage rules:
 * - Stage 1: trigger day = (prev month end - 3) for invoice whose period_start is next month
 * - Stage 2: trigger on period_start (1st)
 * - Stage 3: trigger on due_date
 * - Stage 4: trigger on due_date + 7
 * - Stage 5: trigger on due_date + 30 (first crossing)
 */
function computeStage(today: Date, periodStart: Date, dueDate: Date): number | null {
  const prevMonthStart = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() - 1, 1));
  const stage1 = addDays(monthEnd(prevMonthStart), -3);
  const stage2 = periodStart;
  const stage3 = dueDate;
  const stage4 = addDays(dueDate, 7);
  const stage5 = addDays(dueDate, 30);

  if (datesEqual(today, stage1)) return 1;
  if (datesEqual(today, stage2)) return 2;
  if (datesEqual(today, stage3)) return 3;
  if (datesEqual(today, stage4)) return 4;
  if (datesEqual(today, stage5)) return 5;
  return null;
}

serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // Today in UTC (the function is scheduled at 00:20 UTC)
    const today = parseYMD(ymd(new Date()));
    const todayStr = ymd(today);

    // Pull candidate invoices (rent + have period_start)
    // We join leases for tenant_user_id + rent_paid_until + status
    const { data, error } = await admin
      .from("invoices")
      .select(`
        id,
        lease_id,
        organization_id,
        amount,
        due_date,
        period_start,
        status_text,
        status,
        last_reminder_stage,
        leases!inner(
          tenant_user_id,
          rent_paid_until,
          status
        )
      `)
      .eq("invoice_type", "rent")
      .not("period_start", "is", null);

    if (error) throw error;

    const candidates: Candidate[] = (data ?? []).map((r: any) => ({
      invoice_id: r.id,
      lease_id: r.lease_id,
      organization_id: r.organization_id,
      tenant_user_id: r.leases.tenant_user_id,
      rent_paid_until: r.leases.rent_paid_until,
      lease_status: r.leases.status,
      amount: Number(r.amount),
      due_date: r.due_date,
      period_start: r.period_start,
      status_text: r.status_text ?? null,
      status: r.status ?? null,
      last_reminder_stage: r.last_reminder_stage ?? null,
    })).filter((r) => r.lease_status === "active" && !!r.tenant_user_id);

    const leaseIds = Array.from(new Set((data ?? []).map((r: any) => r.lease_id).filter(Boolean))) as string[];
    const arrearsMap = new Map<string, number>();
    if (leaseIds.length) {
      const { data: arrearsRows, error: arrearsErr } = await admin
        .from("vw_lease_arrears")
        .select("lease_id, arrears_amount")
        .in("lease_id", leaseIds);
      if (arrearsErr) throw arrearsErr;
      for (const row of arrearsRows ?? []) {
        if (row.lease_id) arrearsMap.set(row.lease_id, Number(row.arrears_amount || 0));
      }
    }

    const scheduled0030 = new Date(`${todayStr}T00:30:00.000Z`).toISOString();
    const scheduled1400 = new Date(`${todayStr}T14:00:00.000Z`).toISOString();

    const inserts: any[] = [];

    for (const inv of candidates) {
      // Paid invoices => never remind
      if (isPaid(inv)) continue;

      // Prepaid tenants => suppress reminders
      if (isPrepaidForPeriod(inv)) continue;

      const stage = computeStage(today, parseYMD(inv.period_start), parseYMD(inv.due_date));
      if (!stage) continue;

      // Anti-spam: if dispatch already advanced invoice to this stage (or beyond), skip
      if (inv.last_reminder_stage !== null && inv.last_reminder_stage >= stage) continue;

      const templateKey = `rent_stage_${stage}`;

      const payload = {
        template_key: templateKey,
        invoice_id: inv.invoice_id,
        lease_id: inv.lease_id,
        period_start: inv.period_start,
        due_date: inv.due_date,
        amount: inv.amount,
        stage,
        arrears_amount: stage === 5 ? (arrearsMap.get(inv.lease_id) ?? null) : null,
      };

      const base = {
        user_id: inv.tenant_user_id,
        related_entity_type: "lease",
        related_entity_id: inv.invoice_id,
        reminder_type: "rent_payment",
        organization_id: inv.organization_id,
        delivery_status: "pending",
        stage,
        payload,
      };

      // 1) SMS ONCE per day (00:30 only)
      inserts.push({
        ...base,
        channel: "sms",
        scheduled_slot: "00:30",
        scheduled_for: scheduled0030,
        message: `rent ${templateKey} (invoice ${inv.invoice_id})`,
      });

      // 2) In-app twice per day (00:30 + 14:00)
      inserts.push({
        ...base,
        channel: "in_app",
        scheduled_slot: "00:30",
        scheduled_for: scheduled0030,
        message: `rent ${templateKey} (invoice ${inv.invoice_id})`,
      });

      inserts.push({
        ...base,
        channel: "in_app",
        scheduled_slot: "14:00",
        scheduled_for: scheduled1400,
        message: `rent ${templateKey} (invoice ${inv.invoice_id})`,
      });
    }

    if (inserts.length === 0) {
      return new Response(JSON.stringify({ ok: true, inserted: 0 }), { headers: { "Content-Type": "application/json" } });
    }

    const { error: upsertErr } = await admin
      .from("reminders")
      .upsert(inserts, {
        onConflict: "related_entity_id,reminder_type,stage,channel,scheduled_day,scheduled_slot",
        ignoreDuplicates: true,
      });

    if (upsertErr) throw upsertErr;

    return new Response(JSON.stringify({ ok: true, inserted: inserts.length }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
