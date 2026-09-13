import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";

type Client = SupabaseClient<Database>;
type MemberRole = Database["public"]["Enums"]["member_role"];
type OrderStatus = Database["public"]["Enums"]["order_status"];

/**
 * Atomic business work is submitted through narrowly typed, RLS-protected
 * command tables. A database trigger completes each command within the same
 * INSERT transaction and returns only its safe result columns.
 */
export const businessCommands = {
  submitApplication: (db: Client, name: string, slug: string) =>
    db
      .from("merchant_application_commands")
      .insert({ name, slug })
      .select("merchant_id")
      .single(),

  changeMember: (
    db: Client,
    membershipId: string,
    role: MemberRole,
    active: boolean,
  ) =>
    db
      .from("member_change_commands")
      .insert({ membership_id: membershipId, role, active })
      .select("id")
      .single(),

  setMemberStores: (db: Client, membershipId: string, storeIds: string[]) =>
    db
      .from("member_store_commands")
      .insert({ membership_id: membershipId, store_ids: storeIds })
      .select("id")
      .single(),

  async createInvitation(
    db: Client,
    merchantId: string,
    email: string,
    role: MemberRole,
    storeIds: string[],
  ) {
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const result = await db
      .from("invitation_creation_commands")
      .insert({
        merchant_id: merchantId,
        email,
        role,
        store_ids: storeIds,
        token_hash: tokenHash,
      })
      .select("invitation_id,merchant_name,store_names,role")
      .single();
    return {
      ...result,
      data:
        result.data?.invitation_id && result.data.merchant_name
          ? {
              id: result.data.invitation_id,
              token,
              merchant_name: result.data.merchant_name,
              store_names: result.data.store_names,
              role: result.data.role,
            }
          : null,
    };
  },

  async invitationDetails(db: Client, token: string) {
    const result = await db
      .from("invitation_preview_commands")
      .insert({ token })
      .select("details")
      .single();
    return { ...result, data: result.data?.details ?? null };
  },

  async acceptInvitation(db: Client, token: string) {
    const result = await db
      .from("invitation_acceptance_commands")
      .insert({ token })
      .select("merchant_slug")
      .single();
    return { ...result, data: result.data?.merchant_slug ?? null };
  },

  transitionOrder: (
    db: Client,
    storeOrderId: string,
    expectedVersion: number,
    status: Exclude<OrderStatus, "placed" | "cancelled">,
    reason?: string,
  ) =>
    db
      .from("order_transition_commands")
      .insert({
        store_order_id: storeOrderId,
        expected_version: expectedVersion,
        requested_status: status,
        reason,
      })
      .select("store_order_id,result_version")
      .single(),

  cancelOrder: (db: Client, storeOrderId: string, expectedVersion: number) =>
    db
      .from("order_transition_commands")
      .insert({
        store_order_id: storeOrderId,
        expected_version: expectedVersion,
        requested_status: "cancelled",
      })
      .select("store_order_id,result_version")
      .single(),

  async placeOrder(
    db: Client,
    idempotencyKey: string,
    delivery: Json,
    items: Json,
  ) {
    const result = await db
      .from("order_submission_commands")
      .insert({ idempotency_key: idempotencyKey, delivery, items })
      .select("group_id")
      .single();
    return { ...result, data: result.data?.group_id ?? null };
  },
};
