import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export async function readTeamData(
  db: SupabaseClient<Database>,
  merchantId: string,
) {
  const [members, assignments, invitations, invitationStores] =
    await Promise.all([
      db
        .from("merchant_memberships")
        .select("id,merchant_id,user_id,role,active,email")
        .eq("merchant_id", merchantId)
        .order("role")
        .order("email"),
      db
        .from("merchant_store_assignments")
        .select("membership_id,store_id")
        .eq("merchant_id", merchantId)
        .eq("active", true),
      db
        .from("merchant_invitations")
        .select(
          "id,email,role,expires_at,accepted_at,revoked_at,delivery_state,created_at",
        )
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("merchant_invitation_stores")
        .select("invitation_id,store_id")
        .eq("merchant_id", merchantId),
    ]);
  const error =
    members.error ??
    assignments.error ??
    invitations.error ??
    invitationStores.error;
  return {
    error,
    members: (members.data ?? []).map((member) => ({
      ...member,
      store_ids: (assignments.data ?? [])
        .filter((item) => item.membership_id === member.id)
        .map((item) => item.store_id),
    })),
    invitations: (invitations.data ?? []).map((invitation) => ({
      ...invitation,
      store_ids: (invitationStores.data ?? [])
        .filter((item) => item.invitation_id === invitation.id)
        .map((item) => item.store_id),
    })),
  };
}
