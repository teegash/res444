"use server";

import { createClient } from "@/lib/supabase/server";

async function getActorUserId() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Not authenticated");
  return data.user.id;
}

function appBaseUrl() {
  const v = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (!v) return "http://localhost:3000";
  if (v.startsWith("http")) return v;
  return `https://${v}`;
}

async function postToSelf(path: string, actorUserId: string) {
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!internalKey) throw new Error("Missing INTERNAL_API_KEY");

  const res = await fetch(`${appBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${internalKey}`,
      "x-actor-user-id": actorUserId,
    },
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export async function createLeaseRenewal(leaseId: string) {
  const actorUserId = await getActorUserId();
  return postToSelf(`/api/lease-renewals/${leaseId}/create`, actorUserId);
}

export async function tenantSignRenewal(renewalId: string) {
  const actorUserId = await getActorUserId();
  return postToSelf(`/api/lease-renewals/${renewalId}/tenant-sign`, actorUserId);
}

export async function managerSignRenewal(renewalId: string) {
  const actorUserId = await getActorUserId();
  return postToSelf(`/api/lease-renewals/${renewalId}/manager-sign`, actorUserId);
}

