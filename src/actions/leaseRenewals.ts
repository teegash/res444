"use server";

import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

type Role = "admin" | "manager" | "caretaker" | "tenant";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined) {
  if (!value) return false;
  if (value === "undefined" || value === "null") return false;
  return uuidRegex.test(value);
}

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
  if (!isUuid(leaseId)) {
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
  if (!isUuid(renewalId)) {
    return { ok: false, error: "Missing renewalId" };
  }
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
  if (!isUuid(leaseId)) {
    return { ok: false, error: "Missing leaseId" };
  }
  const actor = await getActorUserIdOrThrow();
  try {
    return await callInternal(`/api/lease-renewals/by-lease/${leaseId}/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${internalKey()}`,
        "x-internal-api-key": internalKey(),
        "x-actor-user-id": actor,
      },
    });
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to start renewal" };
  }
}

export async function tenantSignRenewal(renewalId: string) {
  if (!isUuid(renewalId)) {
    return { ok: false, error: "Missing renewalId" };
  }
  const actor = await getActorUserIdOrThrow();
  try {
    return await callInternal(`/api/lease-renewals/${renewalId}/tenant-sign`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${internalKey()}`,
        "x-internal-api-key": internalKey(),
        "x-actor-user-id": actor,
      },
    });
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to sign renewal" };
  }
}

export async function managerSignRenewal(renewalId: string) {
  if (!isUuid(renewalId)) {
    return { ok: false, error: "Missing renewalId" };
  }
  const actor = await getActorUserIdOrThrow();
  try {
    return await callInternal(`/api/lease-renewals/${renewalId}/manager-sign`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${internalKey()}`,
        "x-internal-api-key": internalKey(),
        "x-actor-user-id": actor,
      },
    });
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to countersign renewal" };
  }
}

export async function getRenewalDownloadUrl(
  renewalId: string,
  type: "unsigned" | "tenant_signed" | "fully_signed"
) {
  if (!isUuid(renewalId)) {
    return { ok: false, error: "Missing renewalId" };
  }
  const actor = await getActorUserIdOrThrow();
  const admin = supabaseAdmin();
  const expectedSuffix =
    type === "unsigned"
      ? "/unsigned.pdf"
      : type === "tenant_signed"
        ? "/tenant_signed.pdf"
        : "/fully_signed.pdf";

  try {
    const { data: renewal, error: rErr } = await admin
      .from("lease_renewals")
      .select("id, organization_id, tenant_user_id, pdf_unsigned_path, pdf_tenant_signed_path, pdf_fully_signed_path")
      .eq("id", renewalId)
      .single();

    if (rErr) return { ok: false, error: rErr.message };

    const r = renewal as any;
    if (r.tenant_user_id !== actor) {
      const role = await getMemberRoleOrNull(admin, r.organization_id, actor);
      if (!role || !["admin", "manager", "caretaker"].includes(role)) {
        return { ok: false, error: "Forbidden" };
      }
    } else {
      const role = await getMemberRoleOrNull(admin, r.organization_id, actor);
      if (!role) return { ok: false, error: "Forbidden" };
    }

    let path: string | null = null;
    if (type === "unsigned") path = r.pdf_unsigned_path;
    if (type === "tenant_signed") path = r.pdf_tenant_signed_path;
    if (type === "fully_signed") path = r.pdf_fully_signed_path;

    if (!path) return { ok: false, error: "File not available" };
    if (!path.endsWith(expectedSuffix)) {
      return { ok: false, error: "Requested file path does not match expected type" };
    }

    const idx = path.lastIndexOf("/");
    const dir = idx === -1 ? "" : path.slice(0, idx);
    const name = idx === -1 ? path : path.slice(idx + 1);
    const { data: listed, error: listErr } = await admin.storage
      .from("lease-renewals")
      .list(dir, { limit: 1, search: name });
    if (listErr) return { ok: false, error: `Storage lookup failed: ${listErr.message}` };
    if (!listed || listed.length === 0) return { ok: false, error: "File not found in storage" };

    const { data: signed, error: sErr } = await admin.storage
      .from("lease-renewals")
      .createSignedUrl(path, 120);
    if (sErr) return { ok: false, error: sErr.message };

    return { ok: true, url: signed.signedUrl };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to get download URL" };
  }
}
