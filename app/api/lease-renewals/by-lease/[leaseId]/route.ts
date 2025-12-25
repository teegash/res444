import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

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

export async function GET(req: Request, { params }: { params: { leaseId: string } }) {
  try {
    requireInternalApiKey(req);
    const actorUserId = requireActorUserId(req);

    let leaseId = params.leaseId;
    if (!leaseId || leaseId === "undefined") {
      const parts = new URL(req.url).pathname.split("/").filter(Boolean);
      const idx = parts.indexOf("by-lease");
      if (idx >= 0 && parts[idx + 1]) {
        leaseId = decodeURIComponent(parts[idx + 1]);
      }
    }
    if (!leaseId || leaseId === "undefined") {
      return json({ error: "Missing leaseId" }, 400);
    }
    const admin = supabaseAdmin();

    const { data: lease, error: lErr } = await admin
      .from("leases")
      .select("id, organization_id, tenant_user_id")
      .eq("id", leaseId)
      .single();

    if (lErr) return json({ error: lErr.message }, 400);

    if (lease.tenant_user_id !== actorUserId) {
      const membership = await getMembership(admin, lease.organization_id, actorUserId);
      const role = String(membership?.role ?? "").toLowerCase();
      if (!["admin", "manager", "caretaker"].includes(role)) {
        return json({ error: "Forbidden: not allowed to view lease renewals" }, 403);
      }
    } else {
      const membership = await getMembership(admin, lease.organization_id, actorUserId);
      if (!membership) return json({ error: "Forbidden: user not a member of organization" }, 403);
    }

    const { data: active, error: aErr } = await admin
      .from("lease_renewals")
      .select("*")
      .eq("lease_id", leaseId)
      .in("status", ["draft", "sent_for_signature", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (aErr) return json({ error: aErr.message }, 400);

    const { data: latest, error: latErr } = await admin
      .from("lease_renewals")
      .select("*")
      .eq("lease_id", leaseId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (latErr) return json({ error: latErr.message }, 400);

    return json({
      ok: true,
      activeRenewal: active?.[0] ?? null,
      latestRenewal: latest?.[0] ?? null,
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
