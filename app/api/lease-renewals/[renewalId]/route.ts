import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type RenewalRow = {
  id: string;
  organization_id: string;
  lease_id: string;
  tenant_user_id: string;
  status: string;
  proposed_start_date: string | null;
  proposed_end_date: string | null;
  proposed_rent: number | null;
  proposed_deposit: number | null;
  notes: string | null;
  pdf_unsigned_path: string | null;
  pdf_tenant_signed_path: string | null;
  pdf_fully_signed_path: string | null;
  tenant_signed_at: string | null;
  manager_signed_at: string | null;
  created_at: string;
  updated_at: string;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function requireInternalApiKey(req: Request) {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) throw new Error("Server misconfigured: INTERNAL_API_KEY missing");

  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    if (token !== expected) throw new Error("Forbidden");
    return;
  }

  const direct = req.headers.get("x-internal-api-key");
  if (direct) {
    if (direct !== expected) throw new Error("Forbidden");
    return;
  }

  throw new Error("Unauthorized");
}

function requireActorUserId(req: Request) {
  const actor = req.headers.get("x-actor-user-id");
  if (!actor) throw new Error("Missing x-actor-user-id");
  return actor;
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getMembership(admin: any, organizationId: string, userId: string) {
  const { data, error } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Organization membership check failed: ${error.message}`);
  return data;
}

export async function GET(req: Request, { params }: { params: { renewalId: string } }) {
  try {
    requireInternalApiKey(req);
    const actorUserId = requireActorUserId(req);

    const renewalId = params.renewalId;
    const admin = supabaseAdmin();

    const { data: renewal, error: rErr } = await admin
      .from("lease_renewals")
      .select("*")
      .eq("id", renewalId)
      .single();

    if (rErr) return json({ error: rErr.message }, 400);

    const r = renewal as RenewalRow;

    if (r.tenant_user_id !== actorUserId) {
      const membership = await getMembership(admin, r.organization_id, actorUserId);
      const role = String(membership?.role ?? "").toLowerCase();
      if (!["admin", "manager", "caretaker"].includes(role)) {
        return json({ error: "Forbidden: not allowed to view this renewal" }, 403);
      }
    } else {
      const membership = await getMembership(admin, r.organization_id, actorUserId);
      if (!membership) return json({ error: "Forbidden: user not a member of organization" }, 403);
    }

    const { data: events, error: eErr } = await admin
      .from("lease_renewal_events")
      .select("id, renewal_id, organization_id, actor_user_id, action, metadata, ip, user_agent, created_at")
      .eq("renewal_id", renewalId)
      .order("created_at", { ascending: true });

    if (eErr) return json({ error: eErr.message }, 400);

    const canTenantSign = r.status === "sent_for_signature" && r.tenant_user_id === actorUserId;
    let canManagerSign = false;
    if (r.status === "in_progress") {
      const membership = await getMembership(admin, r.organization_id, actorUserId);
      const role = String(membership?.role ?? "").toLowerCase();
      canManagerSign = ["admin", "manager", "caretaker"].includes(role);
    }

    return json({
      ok: true,
      renewal: r,
      events: events ?? [],
      allowed: {
        canTenantSign,
        canManagerSign,
      },
      filesAvailable: {
        unsigned: !!r.pdf_unsigned_path,
        tenant_signed: !!r.pdf_tenant_signed_path,
        fully_signed: !!r.pdf_fully_signed_path,
      },
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status =
      msg === "Unauthorized"
        ? 401
        : msg === "Forbidden"
          ? 403
          : msg.startsWith("Missing x-actor-user-id")
            ? 400
            : 500;
    return json({ error: msg }, status);
  }
}
