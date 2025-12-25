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
  const base = appBaseUrl();
  const url = base ? `${base}${path}` : path;
  const res = await fetch(url, { cache: "no-store", ...init });
  const text = await res.text();

  let jsonData: any = null;
  try {
    jsonData = JSON.parse(text);
  } catch {
    jsonData = { raw: text };
  }

  if (!res.ok) {
    throw new Error(jsonData?.error || `Request failed (${res.status})`);
  }

  return jsonData;
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

