import "server-only";
import { supabaseAdmin } from "@/src/server/supabase/admin";

export async function requireOrgRole(args: {
  actorUserId: string;
  organizationId: string;
  allowedRoles: string[];
}) {
  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", args.organizationId)
    .eq("user_id", args.actorUserId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const role = (data?.role ?? null) as string | null;
  if (!role) throw new Error("Forbidden: not a member of organization");
  if (!args.allowedRoles.includes(role)) throw new Error("Forbidden: insufficient role");

  return role;
}

