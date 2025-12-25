"use server";

import { createClient } from "@/lib/supabase/server";

function appBaseUrl() {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  if (vercel) return vercel.replace(/\/$/, "");
  return "";
}

function internalHeaders(actorUserId: string) {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) throw new Error("INTERNAL_API_KEY is missing on server");

  return {
    Authorization: `Bearer ${key}`,
    "x-internal-api-key": key,
    "x-actor-user-id": actorUserId,
    "Content-Type": "application/json",
  };
}

async function getActorUserIdOrThrow() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw new Error("Not authenticated");
  return data.user.id;
}

async function callInternal(path: string, init?: RequestInit) {
  // Prefer relative fetch first to avoid Vercel Preview/Deployment Protection 401s on absolute self-fetches.
  // Fallback to absolute URL only if relative fetch fails in the current runtime.
  const base = appBaseUrl();
  const urls = [path, ...(base ? [`${base}${path}`] : [])];

  let lastErr: unknown = null;

  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store", ...init });
      const text = await res.text();

      let jsonData: any = null;
      try {
        jsonData = JSON.parse(text);
      } catch {
        jsonData = { raw: text };
      }

      if (!res.ok) {
        const msg = jsonData?.error || `Request failed (${res.status})`;
        throw new Error(msg);
      }

      return jsonData;
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function getRenewalByLease(leaseId: string) {
  const actor = await getActorUserIdOrThrow();
  return callInternal(`/api/lease-renewals/by-lease/${leaseId}`, {
    method: "GET",
    headers: internalHeaders(actor),
  });
}

export async function createRenewalByLease(leaseId: string) {
  const actor = await getActorUserIdOrThrow();
  return callInternal(`/api/lease-renewals/by-lease/${leaseId}/create`, {
    method: "POST",
    headers: internalHeaders(actor),
  });
}

export async function getRenewalDetails(renewalId: string) {
  const actor = await getActorUserIdOrThrow();
  return callInternal(`/api/lease-renewals/${renewalId}`, {
    method: "GET",
    headers: internalHeaders(actor),
  });
}

export async function tenantSignRenewal(renewalId: string) {
  const actor = await getActorUserIdOrThrow();
  return callInternal(`/api/lease-renewals/${renewalId}/tenant-sign`, {
    method: "POST",
    headers: internalHeaders(actor),
  });
}

export async function managerSignRenewal(renewalId: string) {
  const actor = await getActorUserIdOrThrow();
  return callInternal(`/api/lease-renewals/${renewalId}/manager-sign`, {
    method: "POST",
    headers: internalHeaders(actor),
  });
}

export async function getRenewalDownloadUrl(
  renewalId: string,
  type: "unsigned" | "tenant_signed" | "fully_signed"
) {
  const actor = await getActorUserIdOrThrow();
  return callInternal(`/api/lease-renewals/${renewalId}/download?type=${type}`, {
    method: "GET",
    headers: internalHeaders(actor),
  });
}
