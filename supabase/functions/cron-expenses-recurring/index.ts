import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type RecurringExpense = {
  id: string;
  property_id: string;
  organization_id: string;
  category: string;
  amount: number;
  notes: string | null;
  next_run: string;
  active: boolean;
  created_by: string | null;
};

function startOfMonthUtc(from: Date): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1, 0, 0, 0, 0));
}

function nextMonthStartUtc(from: Date): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

function addMonthsUtc(monthStart: Date, months: number): Date {
  return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + months, 1, 0, 0, 0, 0));
}

function normalizeNotes(base: string | null, scheduleId: string): string {
  const clean = (base ?? "Recurring expense").trim() || "Recurring expense";
  return `${clean} [recurring:${scheduleId}]`;
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
    const nowIso = now.toISOString();

    const { data, error } = await admin
      .from("recurring_expenses")
      .select("id, property_id, organization_id, category, amount, notes, next_run, active, created_by")
      .eq("active", true)
      .lte("next_run", nowIso);

    if (error) throw error;

    const schedules: RecurringExpense[] = (data ?? []) as any;
    if (schedules.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0, created: 0, skipped: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let created = 0;
    let skipped = 0;

    for (const row of schedules) {
      const scheduleId = row.id;
      const orgId = row.organization_id;
      const propertyId = row.property_id;

      // Catch-up safety: at most 24 months per schedule in one run.
      const maxCatchUpMonths = 24;

      let nextRun = startOfMonthUtc(new Date(row.next_run));
      if (Number.isNaN(nextRun.getTime())) nextRun = startOfMonthUtc(now);

      let monthsProcessed = 0;
      while (nextRun.getTime() <= now.getTime() && monthsProcessed < maxCatchUpMonths) {
        const incurredAtIso = nextRun.toISOString();
        const notes = normalizeNotes(row.notes, scheduleId);

        // Idempotency: skip if already created for this schedule+month.
        const { data: existing, error: existingError } = await admin
          .from("expenses")
          .select("id")
          .eq("organization_id", orgId)
          .eq("property_id", propertyId)
          .eq("incurred_at", incurredAtIso)
          .eq("notes", notes)
          .maybeSingle();

        if (existingError) throw existingError;

        if (!existing) {
          const { error: insertError } = await admin.from("expenses").insert({
            organization_id: orgId,
            property_id: propertyId,
            category: row.category,
            amount: row.amount,
            notes,
            incurred_at: incurredAtIso,
            created_by: row.created_by,
          });
          if (insertError) throw insertError;
          created += 1;
        } else {
          skipped += 1;
        }

        nextRun = addMonthsUtc(nextRun, 1);
        monthsProcessed += 1;
      }

      // After catch-up, next_run should be the next month start AFTER "now" (1st at 00:00 UTC).
      // If the loop ended early (safety), still advance to a sensible next_run to avoid re-processing the same months.
      const safeNextRun = nextMonthStartUtc(startOfMonthUtc(now));
      const updatedNextRun = nextRun.getTime() > safeNextRun.getTime() ? nextRun : safeNextRun;

      const { error: updateError } = await admin
        .from("recurring_expenses")
        .update({ next_run: updatedNextRun.toISOString() })
        .eq("id", scheduleId)
        .eq("organization_id", orgId);

      if (updateError) throw updateError;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed: schedules.length,
        created,
        skipped,
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

