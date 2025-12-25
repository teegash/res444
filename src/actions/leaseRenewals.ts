"use server";

import { createClient } from "@/lib/supabase/server";

function appBaseUrl() {
  const v = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (!v) return "http://localhost:3000";
  if (v.startsWith("http")) return v;
  return `https://${v}`;
}

function internalAuthHeader() {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) throw new Error("Missing INTERNAL_API_KEY on server");
  return `Bearer ${key}`;
}

async function requireServerUserId() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) throw new Error("Not authenticated");
  return data.user.id;
}

export async function tenantSignRenewal(renewalId: string) {
  const actorUserId = await requireServerUserId();

  const res = await fetch(`${appBaseUrl()}/api/lease-renewals/${renewalId}/tenant-sign`, {
    method: "POST",
    headers: {
      Authorization: internalAuthHeader(),
      "x-actor-user-id": actorUserId,
    },
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Tenant signing failed");
  return data;
}

export async function managerSignRenewal(renewalId: string) {
  const actorUserId = await requireServerUserId();

  const res = await fetch(`${appBaseUrl()}/api/lease-renewals/${renewalId}/manager-sign`, {
    method: "POST",
    headers: {
      Authorization: internalAuthHeader(),
      "x-actor-user-id": actorUserId,
    },
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Manager signing failed");
  return data;
}

