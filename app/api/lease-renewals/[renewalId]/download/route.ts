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
  if (!auth.startsWith("Bearer ")) throw new Error("Unauthorized");

  const token = auth.slice("Bearer ".length).trim();
  if (token !== expected) throw new Error("Forbidden");
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
    const url = new URL(req.url);
    const type = (url.searchParams.get("type") || "fully_signed").toLowerCase();
    if (!["unsigned", "tenant_signed", "fully_signed"].includes(type)) {
      return json({ error: "Invalid type. Use unsigned|tenant_signed|fully_signed" }, 400);
    }

    const admin = supabaseAdmin();

    const { data: renewal, error: rErr } = await admin
      .from("lease_renewals")
      .select("id, organization_id, tenant_user_id, pdf_unsigned_path, pdf_tenant_signed_path, pdf_fully_signed_path")
      .eq("id", renewalId)
      .single();

    if (rErr) return json({ error: rErr.message }, 400);

    const r = renewal as any;

    if (r.tenant_user_id !== actorUserId) {
      const membership = await getMembership(admin, r.organization_id, actorUserId);
      const role = String(membership?.role ?? "").toLowerCase();
      if (!["admin", "manager", "caretaker"].includes(role)) {
        return json({ error: "Forbidden: not allowed to download this renewal" }, 403);
      }
    } else {
      const membership = await getMembership(admin, r.organization_id, actorUserId);
      if (!membership) return json({ error: "Forbidden: user not a member of organization" }, 403);
    }

    let path: string | null = null;
    if (type === "unsigned") path = r.pdf_unsigned_path;
    if (type === "tenant_signed") path = r.pdf_tenant_signed_path;
    if (type === "fully_signed") path = r.pdf_fully_signed_path;

    if (!path) return json({ error: "Requested file not available yet" }, 404);

    const { data: signed, error: sErr } = await admin.storage.from("lease-renewals").createSignedUrl(path, 120);

    if (sErr) return json({ error: sErr.message }, 400);

    return json({ ok: true, url: signed.signedUrl });
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

