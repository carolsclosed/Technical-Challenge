"use server";
import { z } from "zod";
import { serverClient } from "@/lib/supabase/server";
import {
  deliverySchema,
  storeSchema,
  nameSchema,
  parsePrice,
  errorCode,
} from "@/lib/domain";
import { revalidatePath } from "next/cache";
import type { Database, Json } from "@/lib/database.types";
import type { TeamInvitation } from "@/lib/auth-email";
import { businessCommands } from "@/lib/business-commands";
const id = z.uuid();
const role = z.enum(["admin", "staff", "operator"]);
const schemas = {
  application: z.object({
    name: nameSchema,
    slug: z
      .string()
      .min(3)
      .max(48)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  }),
  resubmit: z.object({ name: nameSchema }),
  merchant: z.object({
    name: nameSchema,
    slug: z
      .string()
      .min(3)
      .max(48)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  }),
  merchantStatus: z.object({
    id,
    status: z.enum(["active", "rejected", "suspended"]),
    reason: z.string().max(500).optional(),
  }),
  merchantSettings: z.object({ id, name: nameSchema }),
  store: storeSchema.extend({
    merchant: id,
    id: id.optional(),
    version: z.number().int().optional(),
  }),
  product: z.object({
    store: id,
    id: id.optional(),
    version: z.number().int().optional(),
    name: nameSchema,
    description: z.string().trim().max(2000),
    price: z.string(),
    available: z.boolean(),
  }),
  archive: z.object({ id, version: z.number().int() }),
  availability: z.object({
    id,
    version: z.number().int(),
    available: z.boolean(),
  }),
  member: z.object({ id, role, active: z.boolean() }),
  assignStores: z.object({ id, stores: z.array(id).max(100) }),
  revoke: z.object({ id }),
  acceptInvitation: z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }),
  transition: z.object({
    id,
    version: z.number().int(),
    status: z.enum([
      "accepted",
      "preparing",
      "out_for_delivery",
      "delivered",
      "rejected",
    ]),
    reason: z.string().max(500).optional(),
  }),
  cancel: z.object({ id, version: z.number().int() }),
  profile: z.object({
    name: z.string().trim().max(120),
    locale: z.enum(["en", "pt-PT"]),
    theme: z.enum(["system", "light", "dark"]),
  }),
};
export type Operation = keyof typeof schemas;
export async function mutate(
  operation: Operation,
  input: unknown,
): Promise<{ ok: boolean; error?: string; data?: Json }> {
  try {
    const db = await serverClient();
    let result;
    switch (operation) {
      case "application": {
        const v = schemas.application.parse(input);
        result = await businessCommands.submitApplication(db, v.name, v.slug);
        break;
      }
      case "resubmit": {
        const v = schemas.resubmit.parse(input);
        result = await db
          .from("merchants")
          .update({ name: v.name, status: "pending", rejection_reason: null })
          .eq("status", "rejected")
          .select("id")
          .maybeSingle();
        if (!result.error && !result.data)
          return { ok: false, error: "CONFLICT" };
        break;
      }
      case "merchant": {
        const v = schemas.merchant.parse(input);
        result = await db
          .from("merchants")
          .insert({ name: v.name, slug: v.slug })
          .select("id")
          .single();
        break;
      }
      case "merchantStatus": {
        const v = schemas.merchantStatus.parse(input);
        result = await db
          .from("merchants")
          .update({
            status: v.status,
            rejection_reason: v.status === "rejected" ? v.reason : null,
          })
          .eq("id", v.id)
          .select("id")
          .maybeSingle();
        if (!result.error && !result.data)
          return { ok: false, error: "NOT_FOUND" };
        break;
      }
      case "merchantSettings": {
        const v = schemas.merchantSettings.parse(input);
        result = await db
          .from("merchants")
          .update({ name: v.name })
          .eq("id", v.id)
          .select("id")
          .maybeSingle();
        if (!result.error && !result.data)
          return { ok: false, error: "NOT_FOUND" };
        break;
      }
      case "store": {
        const v = schemas.store.parse(input);
        const args = {
          p_name: v.name,
          p_street: v.street,
          p_city: v.city,
          p_state: v.state,
          p_zip_code: v.zip_code,
          p_phone: v.phone,
          p_timezone: v.timezone,
          p_active: v.active,
        };
        result = v.id
          ? await db
              .from("stores")
              .update({
                name: args.p_name,
                street: args.p_street,
                city: args.p_city,
                state: args.p_state,
                zip_code: args.p_zip_code,
                phone: args.p_phone,
                timezone: args.p_timezone,
                active: args.p_active,
              })
              .eq("id", v.id)
              .eq("version", v.version ?? 0)
              .select("id")
              .maybeSingle()
          : await db
              .from("stores")
              .insert({
                merchant_id: v.merchant,
                name: args.p_name,
                street: args.p_street,
                city: args.p_city,
                state: args.p_state,
                zip_code: args.p_zip_code,
                phone: args.p_phone,
                timezone: args.p_timezone,
                active: args.p_active,
              })
              .select("id")
              .single();
        if (v.id && !result.error && !result.data)
          return { ok: false, error: "CONFLICT" };
        break;
      }
      case "product": {
        const v = schemas.product.parse(input);
        const args = {
          p_name: v.name,
          p_description: v.description,
          p_price: parsePrice(v.price),
          p_available: v.available,
        };
        if (v.id) {
          result = await db
            .from("products")
            .update({
              name: args.p_name,
              description: args.p_description,
              price_minor: args.p_price,
              available: args.p_available,
            })
            .eq("id", v.id)
            .eq("version", v.version ?? 0)
            .is("archived_at", null)
            .select("id")
            .maybeSingle();
          if (!result.error && !result.data)
            return { ok: false, error: "CONFLICT" };
        } else {
          const store = await db
            .from("stores")
            .select("merchant_id")
            .eq("id", v.store)
            .maybeSingle();
          if (store.error) result = store;
          else if (!store.data) return { ok: false, error: "NOT_FOUND" };
          else
            result = await db
              .from("products")
              .insert({
                merchant_id: store.data.merchant_id,
                store_id: v.store,
                name: args.p_name,
                description: args.p_description,
                price_minor: args.p_price,
                available: args.p_available,
              })
              .select("id")
              .single();
        }
        break;
      }
      case "archive": {
        const v = schemas.archive.parse(input);
        result = await db
          .from("products")
          .update({ archived_at: new Date().toISOString(), available: false })
          .eq("id", v.id)
          .eq("version", v.version)
          .is("archived_at", null)
          .select("id")
          .maybeSingle();
        if (!result.error && !result.data)
          return { ok: false, error: "CONFLICT" };
        break;
      }
      case "availability": {
        const v = schemas.availability.parse(input);
        result = await db
          .from("products")
          .update({ available: v.available })
          .eq("id", v.id)
          .eq("version", v.version)
          .is("archived_at", null)
          .select("id")
          .maybeSingle();
        if (!result.error && !result.data)
          return { ok: false, error: "CONFLICT" };
        break;
      }
      case "member": {
        const v = schemas.member.parse(input);
        result = await businessCommands.changeMember(
          db,
          v.id,
          v.role,
          v.active,
        );
        break;
      }
      case "assignStores": {
        const v = schemas.assignStores.parse(input);
        result = await businessCommands.setMemberStores(db, v.id, v.stores);
        break;
      }
      case "revoke": {
        const v = schemas.revoke.parse(input);
        result = await db
          .from("merchant_invitations")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", v.id)
          .is("accepted_at", null)
          .is("revoked_at", null);
        break;
      }
      case "acceptInvitation": {
        const v = schemas.acceptInvitation.parse(input);
        result = await businessCommands.acceptInvitation(db, v.token);
        break;
      }
      case "transition": {
        const v = schemas.transition.parse(input);
        result = await businessCommands.transitionOrder(
          db,
          v.id,
          v.version,
          v.status,
          v.reason,
        );
        break;
      }
      case "cancel": {
        const v = schemas.cancel.parse(input);
        result = await businessCommands.cancelOrder(db, v.id, v.version);
        break;
      }
      case "profile": {
        const v = schemas.profile.parse(input);
        const user = await db.auth.getUser();
        if (user.error || !user.data.user)
          return { ok: false, error: "FORBIDDEN" };
        result = await db
          .from("profiles")
          .update({
            display_name: v.name,
            locale: v.locale,
            theme: v.theme,
          })
          .eq("user_id", user.data.user.id);
        break;
      }
      default:
        return { ok: false, error: "VALIDATION_ERROR" };
    }
    if (result.error)
      return { ok: false, error: errorCode(result.error.message) };
    if (
      [
        "store",
        "product",
        "archive",
        "availability",
        "merchantStatus",
        "merchantSettings",
      ].includes(operation)
    ) {
      revalidatePath("/", "page");
      revalidatePath("/[merchantSlug]", "page");
      revalidatePath("/[merchantSlug]/stores/[storeId]", "page");
    }
    return { ok: true, data: result.data as Json };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof z.ZodError
          ? "VALIDATION_ERROR"
          : errorCode(e instanceof Error ? e.message : ""),
    };
  }
}
export async function submitOrder(input: unknown) {
  const schema = z.object({
    key: id,
    delivery: deliverySchema,
    items: z
      .array(
        z.object({
          product_id: id,
          quantity: z.number().int().min(1).max(99),
          unit_price_minor: z.number().int().min(1).max(99999999),
        }),
      )
      .min(1)
      .max(100),
  });
  const v = schema.safeParse(input);
  if (!v.success) return { error: "VALIDATION_ERROR" };
  const db = await serverClient();
  const { data, error } = await businessCommands.placeOrder(
    db,
    v.data.key,
    v.data.delivery,
    v.data.items,
  );
  if (error) return { error: errorCode(error.message) };
  revalidatePath("/orders");
  return { id: data };
}
export async function readInvitation(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token))
    return { ok: false as const, error: "INVITATION_INVALID" };
  const db = await serverClient();
  const { data, error } = await businessCommands.invitationDetails(
    db,
    token,
  );
  return error
    ? { ok: false as const, error: errorCode(error.message) }
    : {
        ok: true as const,
        data: data as {
          merchant_name: string;
          store_names: string[];
          role: "admin" | "staff" | "operator";
          expires_at: string;
        },
      };
}
export async function invite(input: unknown) {
  const v = z
    .object({
      merchant: id,
      email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
      role,
      stores: z.array(id).max(100).default([]),
      locale: z.enum(["en", "pt-PT"]).default("en"),
    })
    .safeParse(input);
  if (!v.success) return { ok: false, error: "VALIDATION_ERROR" };
  const db = await serverClient();
  const { data, error } = await businessCommands.createInvitation(
    db,
    v.data.merchant,
    v.data.email,
    v.data.role,
    v.data.stores,
  );
  if (error) return { ok: false, error: errorCode(error.message) };
  if (!data) return { ok: false, error: "REQUEST_FAILED" };
  const invitation = data as TeamInvitation;
  let sent = false;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const [{ sendMail }, { teamInvitationEmail }] = await Promise.all([
      import("@/lib/mail"),
      import("@/lib/auth-email"),
    ]);
    const site = process.env.NEXT_PUBLIC_SITE_URL!;
    const redirectTo = `${site}/auth/callback?next=${encodeURIComponent("/account#invitation=" + invitation.token)}`;
    // This Admin API is reached only after create_invitation authorizes AAL2,
    // merchant role and store ownership. It never exposes a service credential.
    const { data: link, error: linkError } =
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email: v.data.email,
        options: { redirectTo },
      });
    if (linkError || !link.properties.hashed_token) throw Error("inviteFailed");
    await sendMail(
      teamInvitationEmail(
        {
          email: v.data.email,
          hash: link.properties.hashed_token,
          invitation,
          locale: v.data.locale,
        },
        site,
      ),
    );
    sent = true;
  } catch {
    sent = false;
  }
  const { data: stateData, error: stateError } = await db
    .from("merchant_invitations")
    .update({ delivery_state: sent ? "sent" : "failed" })
    .eq("id", invitation.id)
    .select("id")
    .maybeSingle();
  if (sent)
    return stateError || !stateData
      ? { ok: false, error: "inviteSentStateFailed" }
      : { ok: true };
  return { ok: false, error: "inviteFailed" };
}
