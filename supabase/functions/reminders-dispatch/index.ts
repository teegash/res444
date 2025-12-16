import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ReminderRow = {
  id: string;
  user_id: string;
  organization_id: string | null;
  related_entity_id: string | null; // we store invoice_id here for rent reminders
  reminder_type: string | null;      // 'rent_payment'
  scheduled_for: string;             // timestamptz ISO
  delivery_status: "pending" | "sent" | "failed" | null;
  channel: "sms" | "in_app" | null;
  stage: number | null;
  scheduled_slot: "00:30" | "14:00" | null;
  attempt_count: number;
  last_error: string | null;
  payload: any | null;
  message: string | null;            // ✅ included
};

function renderTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v);
  }
  return out;
}

function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

function monthLabel(periodStartYmd: string): string {
  const d = new Date(`${periodStartYmd}T00:00:00.000Z`);
  const month = d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return `${month} ${d.getUTCFullYear()}`;
}

function formatKenyaPhone(phone: string): string {
  let p = String(phone).replace(/\s+/g, "").trim();
  if (!p) return p;
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("254")) return `+${p}`;
  if (p.startsWith("0")) return `+254${p.slice(1)}`;
  if (p.length === 9) return `+254${p}`;
  return `+${p}`;
}

async function sendAfricasTalkingSMS(args: {
  apiKey: string;
  username: string;
  to: string;
  message: string;
  senderId?: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    const form = new URLSearchParams();
    form.set("username", args.username);
    form.set("to", args.to);
    form.set("message", args.message);
    if (args.senderId) form.set("from", args.senderId);

    const res = await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: {
        apikey: args.apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: form.toString(),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return { ok: false, error: `AT_HTTP_${res.status}: ${JSON.stringify(json)}` };
    }

    // Typical response: json.SMSMessageData.Recipients[0].messageId
    const msgId =
      json?.SMSMessageData?.Recipients?.[0]?.messageId ||
      json?.SMSMessageData?.Recipients?.[0]?.message_id ||
      undefined;

    return { ok: true, messageId: msgId };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function utcDayStringFromIso(iso: string): string {
  // returns YYYY-MM-DD in UTC
  return new Date(iso).toISOString().slice(0, 10);
}

function utc1400IsoForDay(dayYmd: string): string {
  return `${dayYmd}T14:00:00.000Z`;
}

serve(async (req) => {
  // 🔐 Auth via x-cron-secret (Supabase tester may override Authorization)
  const cronSecret = req.headers.get("x-cron-secret") ?? "";
  if (cronSecret !== Deno.env.get("CRON_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const atApiKey = Deno.env.get("AFRICAS_TALKING_API_KEY") ?? "";
    const atUsername = Deno.env.get("AFRICAS_TALKING_USERNAME") ?? "";
    const atSenderId = Deno.env.get("AFRICAS_TALKING_SENDER_ID") ?? undefined;

    const nowIso = new Date().toISOString();

    // 1) Load due reminders (batch)
    const { data: reminders, error } = await admin
      .from("reminders")
      .select(
        "id,user_id,organization_id,related_entity_id,reminder_type,scheduled_for,delivery_status,channel,stage,scheduled_slot,attempt_count,last_error,payload,message"
      )
      .eq("delivery_status", "pending")
      .lte("scheduled_for", nowIso)
      .order("scheduled_for", { ascending: true })
      .limit(200);

    if (error) throw error;

    const rows: ReminderRow[] = (reminders ?? []) as any;
    if (rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0, sent: 0, failed: 0, retried: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2) Batch fetch supporting data
    const invoiceIds = Array.from(new Set(rows.map((r) => r.related_entity_id).filter(Boolean))) as string[];
    const userIds = Array.from(new Set(rows.map((r) => r.user_id))) as string[];
    const orgIds = Array.from(new Set(rows.map((r) => r.organization_id).filter(Boolean))) as string[];

    // 2a) invoices
    const invoicesById = new Map<string, any>();
    if (invoiceIds.length) {
      const { data: inv, error: invErr } = await admin
        .from("invoices")
        .select("id,lease_id,period_start,due_date,amount,status_text,status")
        .in("id", invoiceIds);
      if (invErr) throw invErr;
      for (const i of inv ?? []) invoicesById.set(i.id, i);
    }

    // 2b) leases
    const leaseIds = Array.from(
      new Set(Array.from(invoicesById.values()).map((i: any) => i.lease_id).filter(Boolean))
    ) as string[];
    const leasesById = new Map<string, any>();
    if (leaseIds.length) {
      const { data: ls, error: lsErr } = await admin
        .from("leases")
        .select("id,unit_id,tenant_user_id,rent_paid_until,status,organization_id")
        .in("id", leaseIds);
      if (lsErr) throw lsErr;
      for (const l of ls ?? []) leasesById.set(l.id, l);
    }

    // 2c) units
    const unitIds = Array.from(
      new Set(Array.from(leasesById.values()).map((l: any) => l.unit_id).filter(Boolean))
    ) as string[];
    const unitsById = new Map<string, any>();
    if (unitIds.length) {
      const { data: units, error: uErr } = await admin
        .from("apartment_units")
        .select("id,unit_number")
        .in("id", unitIds);
      if (uErr) throw uErr;
      for (const u of units ?? []) unitsById.set(u.id, u);
    }

    // 2d) profiles (phone + name)
    const profilesById = new Map<string, any>();
    if (userIds.length) {
      const { data: prof, error: pErr } = await admin
        .from("user_profiles")
        .select("id,full_name,phone_number")
        .in("id", userIds);
      if (pErr) throw pErr;
      for (const p of prof ?? []) profilesById.set(p.id, p);
    }

    // 2e) sender per org: choose admin user from organization_members
    const senderByOrg = new Map<string, string>();
    if (orgIds.length) {
      const { data: admins, error: aErr } = await admin
        .from("organization_members")
        .select("organization_id,user_id,role")
        .in("organization_id", orgIds)
        .eq("role", "admin");
      if (aErr) throw aErr;
      for (const a of admins ?? []) {
        if (!senderByOrg.has(a.organization_id)) senderByOrg.set(a.organization_id, a.user_id);
      }
    }

    // 2f) sms templates for involved orgs
    const templatesByOrgKey = new Map<string, string>();
    if (orgIds.length) {
      const { data: tpls, error: tErr } = await admin
        .from("sms_templates")
        .select("organization_id,template_key,content")
        .in("organization_id", orgIds);
      if (tErr) throw tErr;
      for (const t of tpls ?? []) templatesByOrgKey.set(`${t.organization_id}:${t.template_key}`, t.content);
    }

    // 3) Dispatch each reminder
    let sent = 0;
    let failed = 0;
    let retried = 0;

    for (const r of rows) {
      const orgId = r.organization_id ?? "";
      const senderUserId = senderByOrg.get(orgId);

      // If no sender, fail (communications.sender_user_id is NOT NULL)
      if (!senderUserId) {
        await admin
          .from("reminders")
          .update({
            delivery_status: "failed",
            last_error: "No org admin sender found (organization_members role=admin)",
            attempt_count: r.attempt_count + 1,
          })
          .eq("id", r.id);
        failed++;
        continue;
      }

      const inv = r.related_entity_id ? invoicesById.get(r.related_entity_id) : null;
      const lease = inv?.lease_id ? leasesById.get(inv.lease_id) : null;
      const unit = lease?.unit_id ? unitsById.get(lease.unit_id) : null;
      const profile = profilesById.get(r.user_id);

      const templateKey = r.payload?.template_key as string | undefined;
      const template =
        (templateKey ? templatesByOrgKey.get(`${orgId}:${templateKey}`) : null) ??
        r.message ??
        "Reminder";

      const vars: Record<string, string> = {
        tenant_name: profile?.full_name ?? "Tenant",
        unit_label: unit?.unit_number ?? "",
        amount: formatMoney(Number(r.payload?.amount ?? inv?.amount ?? 0)),
        due_date: String(r.payload?.due_date ?? inv?.due_date ?? ""),
        period_label: r.payload?.period_start
          ? monthLabel(String(r.payload.period_start))
          : inv?.period_start
          ? monthLabel(String(inv.period_start))
          : "",
        arrears_total: "", // Step 6 will populate if you choose to compute arrears here
      };

      const finalMessage = renderTemplate(String(template), vars);

      // ---------------------------
      // IN-APP CHANNEL
      // ---------------------------
      if (r.channel === "in_app") {
        const { error: cErr } = await admin.from("communications").insert({
          sender_user_id: senderUserId,
          recipient_user_id: r.user_id,
          related_entity_type: "lease",
          related_entity_id: inv?.lease_id ?? r.related_entity_id,
          message_text: finalMessage,
          message_type: "in_app",
          read: false,
          organization_id: orgId,
        });

        if (cErr) {
          await admin
            .from("reminders")
            .update({
              delivery_status: "failed",
              last_error: `COMM_INSERT: ${cErr.message}`,
              attempt_count: r.attempt_count + 1,
            })
            .eq("id", r.id);
          failed++;
          continue;
        }

        await admin
          .from("reminders")
          .update({
            delivery_status: "sent",
            sent_at: new Date().toISOString(),
            attempt_count: r.attempt_count + 1,
            last_error: null,
          })
          .eq("id", r.id);

        sent++;
        continue;
      }

      // ---------------------------
      // SMS CHANNEL
      // ---------------------------
      const rawPhone = profile?.phone_number;
      if (!rawPhone) {
        await admin
          .from("reminders")
          .update({
            delivery_status: "failed",
            last_error: "Missing tenant phone_number",
            attempt_count: r.attempt_count + 1,
          })
          .eq("id", r.id);
        failed++;
        continue;
      }

      if (!atApiKey || !atUsername) {
        await admin
          .from("reminders")
          .update({
            delivery_status: "failed",
            last_error: "Africa's Talking not configured (AFRICAS_TALKING_API_KEY/USERNAME missing)",
            attempt_count: r.attempt_count + 1,
          })
          .eq("id", r.id);
        failed++;
        continue;
      }

      const to = formatKenyaPhone(String(rawPhone));

      const smsRes = await sendAfricasTalkingSMS({
        apiKey: atApiKey,
        username: atUsername,
        to,
        message: finalMessage,
        senderId: atSenderId,
      });

      if (!smsRes.ok) {
        // Retry policy: first failure reschedules same reminder to 14:00 UTC; second failure => failed
        const nextAttempt = r.attempt_count + 1;

        if (r.attempt_count === 0) {
          const day = utcDayStringFromIso(r.scheduled_for);
          const resched = utc1400IsoForDay(day);

          await admin
            .from("reminders")
            .update({
              delivery_status: "pending",
              scheduled_for: resched,
              scheduled_slot: "14:00",
              attempt_count: nextAttempt,
              last_error: smsRes.error ?? "SMS failed",
            })
            .eq("id", r.id);

          retried++;
          continue;
        } else {
          await admin
            .from("reminders")
            .update({
              delivery_status: "failed",
              attempt_count: nextAttempt,
              last_error: smsRes.error ?? "SMS failed",
            })
            .eq("id", r.id);

          failed++;
          continue;
        }
      }

      // Log SMS in communications for audit
      await admin.from("communications").insert({
        sender_user_id: senderUserId,
        recipient_user_id: r.user_id,
        related_entity_type: "lease",
        related_entity_id: inv?.lease_id ?? r.related_entity_id,
        message_text: finalMessage,
        message_type: "sms",
        read: true,
        sent_via_africas_talking: true,
        africas_talking_message_id: smsRes.messageId ?? null,
        organization_id: orgId,
      });

      // Mark reminder sent
      await admin
        .from("reminders")
        .update({
          delivery_status: "sent",
          sent_at: new Date().toISOString(),
          sent_via_africas_talking: true,
          attempt_count: r.attempt_count + 1,
          last_error: null,
        })
        .eq("id", r.id);

      // Update invoice anti-spam markers ONLY after SMS success
      if (inv?.id && r.stage) {
        await admin
          .from("invoices")
          .update({
            last_reminder_stage: r.stage,
            last_reminder_sent_at: new Date().toISOString(),
          })
          .eq("id", inv.id);
      }

      sent++;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed: rows.length,
        sent,
        failed,
        retried,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
