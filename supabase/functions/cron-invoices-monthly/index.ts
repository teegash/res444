import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type LeaseRow = {
  id: string;
  organization_id: string;
  monthly_rent: number;
  status: string | null;
  rent_paid_until: string | null;
  start_date: string | null;
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);

function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function addMonthsUtc(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 0, 0, 0, 0));
}

function rentDueDateForPeriod(periodStart: Date): string {
  const due = new Date(periodStart);
  due.setUTCDate(5);
  return ymd(due);
}

function monthLabel(periodStart: Date): string {
  return periodStart.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function parseYmd(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function leaseEligiblePeriodStart(leaseStart: Date | null): Date | null {
  if (!leaseStart || Number.isNaN(leaseStart.getTime())) return null;
  const startMonth = startOfMonthUtc(leaseStart);
  return leaseStart.getUTCDate() > 1 ? addMonthsUtc(startMonth, 1) : startMonth;
}

serve(async (req) => {
  const cronSecret = req.headers.get("x-cron-secret") ?? "";
  if (cronSecret !== (Deno.env.get("CRON_SECRET") ?? "")) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const now = new Date();
    const periodStart = startOfMonthUtc(now);
    const periodStartYmd = ymd(periodStart);
    const dueDateYmd = rentDueDateForPeriod(periodStart);
    const label = monthLabel(periodStart);

    const { data: leases, error } = await admin
      .from("leases")
      .select("id, organization_id, monthly_rent, status, rent_paid_until, start_date")
      .eq("status", "active");

    if (error) throw error;

    const rows: LeaseRow[] = (leases ?? []) as any;
    if (rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, invoices_created: 0, leases_processed: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let created = 0;
    let skippedPrepaid = 0;

    for (const lease of rows) {
      const eligibleStart = lease.start_date ? leaseEligiblePeriodStart(parseYmd(lease.start_date)) : null;
      if (eligibleStart && periodStart.getTime() < eligibleStart.getTime()) {
        continue;
      }

      const rentPaidUntil = lease.rent_paid_until ? startOfMonthUtc(parseYmd(lease.rent_paid_until)) : null;
      // `rent_paid_until` uses month-start semantics (paid through that rent month)
      if (rentPaidUntil && rentPaidUntil.getTime() >= periodStart.getTime()) {
        skippedPrepaid += 1;
        continue;
      }

      // Idempotent by unique constraint: (lease_id, invoice_type, period_start)
      const { error: upsertError } = await admin
        .from("invoices")
        .upsert(
          {
            lease_id: lease.id,
            organization_id: lease.organization_id,
            invoice_type: "rent",
            amount: Number(lease.monthly_rent || 0),
            period_start: periodStartYmd,
            due_date: dueDateYmd,
            status: false,
            status_text: "unpaid",
            months_covered: 1,
            description: `Monthly rent for ${label}`,
          },
          { onConflict: "lease_id,invoice_type,period_start", ignoreDuplicates: true },
        );

      if (upsertError) throw upsertError;
      // Note: ignoreDuplicates doesn't tell us if it inserted; keep count as "attempted".
      created += 1;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        invoices_attempted: created,
        leases_processed: rows.length,
        skipped_prepaid: skippedPrepaid,
        period_start: periodStartYmd,
        due_date: dueDateYmd,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
