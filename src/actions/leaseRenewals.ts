"use server";

import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

type Role = "admin" | "manager" | "caretaker" | "tenant";

async function supabaseAuthed() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          if (typeof cookieStore.set !== "function") return;
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set({ name, value, ...options });
          });
        },
      },
    }
  );
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getActorUserIdOrThrow() {
  const supabase = await supabaseAuthed();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw new Error("Not authenticated");
  return data.user.id;
}

async function getMemberRoleOrNull(
  admin: any,
  organizationId: string,
  userId: string
): Promise<Role | null> {
  const { data, error } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Organization membership check failed: ${error.message}`);
  const role = (data?.role ?? null) as Role | null;
  return role;
}

async function resolveInternalUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  const hdrs = await headers();
  const proto = hdrs.get("x-forwarded-proto") || "https";
  const host = hdrs.get("x-forwarded-host") || hdrs.get("host");

  if (host) return `${proto}://${host}${path}`;

  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (appUrl) return `${appUrl.replace(/\/$/, "")}${path}`;

  const vercel = process.env.VERCEL_URL;
  if (vercel) return `${vercel.startsWith("http") ? vercel : `https://${vercel}`}${path}`;

  return `http://localhost:3000${path}`;
}

export async function getRenewalByLease(leaseId: string) {
  if (!leaseId || leaseId === "undefined") {
    return { ok: false, activeRenewal: null, latestRenewal: null };
  }
  const actor = await getActorUserIdOrThrow();
  const admin = supabaseAdmin();

  const { data: lease, error: lErr } = await admin
    .from("leases")
    .select("id, organization_id, tenant_user_id")
    .eq("id", leaseId)
    .single();

  if (lErr) throw new Error(lErr.message);

  if (lease.tenant_user_id !== actor) {
    const role = await getMemberRoleOrNull(admin, lease.organization_id, actor);
    if (!role || !["admin", "manager", "caretaker"].includes(role)) {
      throw new Error("Forbidden");
    }
  } else {
    const role = await getMemberRoleOrNull(admin, lease.organization_id, actor);
    if (!role) throw new Error("Forbidden");
  }

  const { data: active, error: aErr } = await admin
    .from("lease_renewals")
    .select("*")
    .eq("lease_id", leaseId)
    .in("status", ["draft", "sent_for_signature", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (aErr) throw new Error(aErr.message);

  const { data: latest, error: latErr } = await admin
    .from("lease_renewals")
    .select("*")
    .eq("lease_id", leaseId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (latErr) throw new Error(latErr.message);

  return { ok: true, activeRenewal: active?.[0] ?? null, latestRenewal: latest?.[0] ?? null };
}

export async function getRenewalDetails(renewalId: string) {
  if (!renewalId || renewalId === "undefined") throw new Error("Missing renewalId");
  const actor = await getActorUserIdOrThrow();
  const admin = supabaseAdmin();

  const { data: renewal, error: rErr } = await admin
    .from("lease_renewals")
    .select("*")
    .eq("id", renewalId)
    .single();

  if (rErr) throw new Error(rErr.message);

  const r: any = renewal;

  if (r.tenant_user_id !== actor) {
    const role = await getMemberRoleOrNull(admin, r.organization_id, actor);
    if (!role || !["admin", "manager", "caretaker"].includes(role)) throw new Error("Forbidden");
  } else {
    const role = await getMemberRoleOrNull(admin, r.organization_id, actor);
    if (!role) throw new Error("Forbidden");
  }

  const { data: events, error: eErr } = await admin
    .from("lease_renewal_events")
    .select("id, renewal_id, organization_id, actor_user_id, action, metadata, ip, user_agent, created_at")
    .eq("renewal_id", renewalId)
    .order("created_at", { ascending: true });

  if (eErr) throw new Error(eErr.message);

  const canTenantSign = r.status === "sent_for_signature" && r.tenant_user_id === actor;

  let canManagerSign = false;
  if (r.status === "in_progress") {
    const role = await getMemberRoleOrNull(admin, r.organization_id, actor);
    canManagerSign = !!role && ["admin", "manager", "caretaker"].includes(role);
  }

  return {
    ok: true,
    renewal: r,
    events: events ?? [],
    allowed: { canTenantSign, canManagerSign },
    filesAvailable: {
      unsigned: !!r.pdf_unsigned_path,
      tenant_signed: !!r.pdf_tenant_signed_path,
      fully_signed: !!r.pdf_fully_signed_path,
    },
  };
}

async function callInternal(path: string, init: RequestInit) {
  const url = await resolveInternalUrl(path);
  const incoming = await headers();
  const mergedHeaders = new Headers(init.headers || {});
  const cookieHeader = incoming.get("cookie");
  if (cookieHeader) mergedHeaders.set("cookie", cookieHeader);

  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: mergedHeaders,
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json;
}

function internalKey() {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) throw new Error("INTERNAL_API_KEY missing");
  return key;
}

export async function createRenewalByLease(leaseId: string) {
  if (!leaseId || leaseId === "undefined") {
    return { ok: false, error: "Missing leaseId" };
  }
  const actor = await getActorUserIdOrThrow();
  return callInternal(`/api/lease-renewals/by-lease/${leaseId}/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${internalKey()}`,
      "x-internal-api-key": internalKey(),
      "x-actor-user-id": actor,
    },
  });
}

export async function tenantSignRenewal(renewalId: string) {
  if (!renewalId || renewalId === "undefined") throw new Error("Missing renewalId");
  const actor = await getActorUserIdOrThrow();
  return callInternal(`/api/lease-renewals/${renewalId}/tenant-sign`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${internalKey()}`,
      "x-internal-api-key": internalKey(),
      "x-actor-user-id": actor,
    },
  });
}

export async function managerSignRenewal(renewalId: string) {
  if (!renewalId || renewalId === "undefined") throw new Error("Missing renewalId");
  const actor = await getActorUserIdOrThrow();
  return callInternal(`/api/lease-renewals/${renewalId}/manager-sign`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${internalKey()}`,
      "x-internal-api-key": internalKey(),
      "x-actor-user-id": actor,
    },
  });
}

export async function getRenewalDownloadUrl(
  renewalId: string,
  type: "unsigned" | "tenant_signed" | "fully_signed"
) {
  if (!renewalId || renewalId === "undefined") throw new Error("Missing renewalId");
  const actor = await getActorUserIdOrThrow();
  return callInternal(`/api/lease-renewals/${renewalId}/download?type=${type}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${internalKey()}`,
      "x-internal-api-key": internalKey(),
      "x-actor-user-id": actor,
    },
  });
}
