import "server-only";
import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { serverClient } from "./supabase/server";
import type { Context } from "./domain";

// React's cache is scoped to this server render. Never share identity data
// between requests or cache an authorization decision across users.
export const sessionContext = cache(async () => {
  const db = await serverClient();
  const [{ data: flags, error: flagsError }, { data: claims }] =
    await Promise.all([
      db.from("account_flags").select("platform,has_membership").single(),
      db.auth.getClaims(),
    ]);
  if (flagsError) throw Error("REQUEST_FAILED");
  let membership: Context["membership"] = null;
  if (flags.has_membership && claims?.claims.aal === "aal2") {
    const { data, error } = await db
      .from("merchant_memberships")
      .select("merchant_id,role,merchants!inner(slug,name,status)")
      .eq("user_id", claims.claims.sub)
      .eq("active", true)
      .maybeSingle();
    if (error) throw Error("REQUEST_FAILED");
    if (data) {
      membership = {
        merchant_id: data.merchant_id,
        role: data.role,
        slug: data.merchants.slug,
        name: data.merchants.name,
        status: data.merchants.status,
      };
    }
  }
  return {
    platform: !!flags.platform,
    has_membership: !!flags.has_membership,
    membership,
  } satisfies Context;
});

const identity = cache(async () => {
  const db = await serverClient();
  const [
    {
      data: { user },
    },
    { data: claims },
  ] = await Promise.all([db.auth.getUser(), db.auth.getClaims()]);
  const currentLevel =
    claims?.claims.sub === user?.id && claims?.claims.aal === "aal2"
      ? "aal2"
      : "aal1";
  return { db, user, currentLevel };
});

export async function requireUser(next: string, privileged = false) {
  const { db, user, currentLevel } = await identity();
  if (!user) redirect("/auth/sign-in?next=" + encodeURIComponent(next));
  // Login handles the TOTP challenge. Ordinary navigation must not initiate
  // a new challenge; privileged routes still require the verified AAL2 claim.
  if (privileged && currentLevel !== "aal2") {
    redirect("/auth/mfa?next=" + encodeURIComponent(next));
  }
  return { db, user };
}

export async function requireMerchant(slug: string) {
  const { db, user } = await requireUser("/" + slug + "/dashboard", true);
  const context = await sessionContext();
  if (context.platform) {
    const { data: merchant, error } = await db
      .from("merchants")
      .select("id,slug,name,status")
      .eq("slug", slug)
      .single();
    if (error || !merchant) notFound();
    return {
      db,
      user,
      platform: true,
      member: {
        merchant_id: merchant.id,
        slug: merchant.slug,
        name: merchant.name,
        status: merchant.status,
        role: "admin" as const,
      },
    };
  }
  if (!context.membership || context.membership.slug !== slug) notFound();
  if (!["active", "suspended"].includes(context.membership.status))
    redirect("/merchant/status");
  return { db, user, member: context.membership, platform: false };
}

export async function requirePlatform() {
  const { db, user } = await requireUser("/platform", true);
  if (!(await sessionContext()).platform) notFound();
  return { db, user };
}
