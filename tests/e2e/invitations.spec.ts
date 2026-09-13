import { localOnly } from "../../scripts/env";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { test, expect } from "@playwright/test";
import pg from "pg";
import {
  teamInvitationEmail,
  type TeamInvitation,
} from "../../src/lib/auth-email";

localOnly();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const merchant = "10000000-0000-4000-8000-000000000001";
const store = "20000000-0000-4000-8000-000000000001";
const password = "InvitationTest!2026";

function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.replace(/=+$/, "")]
    .map((char) =>
      alphabet.indexOf(char.toUpperCase()).toString(2).padStart(5, "0"),
    )
    .join("");
  const key = Buffer.from(
    (bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", key).update(counter).digest();
  return ((hash.readUInt32BE(hash.at(-1)! & 15) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}

test.afterAll(async () => {
  await pool.end();
});

for (const scenario of [
  { role: "staff", session: "aal1", mfa: false },
  { role: "staff", session: "aal1", mfa: true },
  { role: "operator", session: "aal2", mfa: true },
  { role: "operator", session: "logged-out", mfa: true },
  { role: "staff", session: "logged-out", mfa: false },
] as const) {
  const { role } = scenario;
  const signedIn = scenario.session !== "logged-out";
  test(`${role} invitation: ${scenario.session} recipient (${scenario.mfa ? "MFA enabled" : "no factor"})`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const email = `invitation-${randomUUID()}@mesa.test`;
    const { data: userData, error: userError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    expect(userError).toBeNull();
    if (!userData.user) throw Error("Missing local invitation user");
    const user = userData.user;
    let invitation: TeamInvitation | undefined;
    let secret = "";
    let lastStep = -1;
    let mfaChecks = 0;
    let magicLinkVerifications = 0;
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (request.method() === "POST" && /\/factors\/[^/]+\/verify$/.test(path))
        mfaChecks++;
      if (request.method() === "POST" && path === "/auth/v1/verify")
        magicLinkVerifications++;
    });

    async function completeMfa(next = "/account") {
      await expect(page).toHaveURL(
        `http://localhost:3000/auth/mfa?next=${encodeURIComponent(next)}`,
      );
      await expect(
        page.getByRole("button", { name: "Verify", exact: true }),
      ).toBeEnabled();
      if (Math.floor(Date.now() / 30000) === lastStep)
        await delay(30050 - (Date.now() % 30000));
      await page
        .getByLabel("Authentication code", { exact: true })
        .fill(totp(secret));
      const verified = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          /\/factors\/[^/]+\/verify$/.test(new URL(response.url()).pathname),
      );
      await page.getByRole("button", { name: "Verify", exact: true }).click();
      expect((await verified).status()).toBe(200);
      lastStep = Math.floor(Date.now() / 30000);
    }
    try {
      if (scenario.mfa) {
        const client = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        expect(
          (await client.auth.signInWithPassword({ email, password })).error,
        ).toBeNull();
        const { data: factor, error } = await client.auth.mfa.enroll({
          factorType: "totp",
        });
        expect(error).toBeNull();
        if (!factor) throw Error("Missing invitation test factor");
        secret = factor.totp.secret;
        expect(
          (
            await client.auth.mfa.challengeAndVerify({
              factorId: factor.id,
              code: totp(secret),
            })
          ).error,
        ).toBeNull();
        lastStep = Math.floor(Date.now() / 30000);
        await client.auth.signOut();
      }
      if (signedIn && scenario.session === "aal1" && scenario.mfa) {
        // An already signed-in AAL1 recipient must be able to accept even
        // with an enabled factor. Establish real SSR cookies directly here;
        // fresh logins through the app correctly require the MFA challenge.
        const cookies = new Map<string, string>();
        const client = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          {
            cookies: {
              getAll: () =>
                [...cookies].map(([name, value]) => ({ name, value })),
              setAll: (items) => {
                for (const { name, value } of items) cookies.set(name, value);
              },
            },
          },
        );
        expect(
          (await client.auth.signInWithPassword({ email, password })).error,
        ).toBeNull();
        expect(
          (await client.auth.mfa.getAuthenticatorAssuranceLevel()).data,
        ).toMatchObject({ currentLevel: "aal1", nextLevel: "aal2" });
        await page.context().addCookies(
          [...cookies].map(([name, value]) => ({
            name,
            value,
            url: "http://localhost:3000",
            sameSite: "Lax" as const,
          })),
        );
      } else if (signedIn) {
        await page.goto("/auth/sign-in?next=%2Faccount");
        await page.getByLabel("Email", { exact: true }).fill(email);
        await page.getByLabel("Password", { exact: true }).fill(password);
        await page
          .getByRole("button", { name: "Sign in", exact: true })
          .click();
        if (scenario.mfa) await completeMfa();
        await expect(page).toHaveURL(/\/account$/);
      }
      // Fixture creation uses the same RLS-protected command table as the
      // owner form. The recipient uses real Auth cookies, OTP, MFA and actions.
      const token = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const connection = await pool.connect();
      try {
        await connection.query("begin");
        const {
          rows: [owner],
        } = await connection.query(
          "select id from auth.users where email='admin@mesa.test'",
        );
        await connection.query("set local role authenticated");
        await connection.query(
          "select set_config('request.jwt.claims',$1,true)",
          [
            JSON.stringify({
              sub: owner.id,
              role: "authenticated",
              aal: "aal2",
            }),
          ],
        );
        const {
          rows: [result],
        } = await connection.query(
          "insert into public.invitation_creation_commands(merchant_id,email,role,store_ids,token_hash) values($1,$2,$3,$4,$5) returning invitation_id,merchant_name,store_names,role",
          [merchant, email, role, [store], tokenHash],
        );
        invitation = {
          id: result.invitation_id,
          token,
          merchant_name: result.merchant_name,
          store_names: result.store_names,
          role: result.role,
        };
        await connection.query("commit");
      } catch (error) {
        await connection.query("rollback");
        throw error;
      } finally {
        connection.release();
      }
      if (!invitation) throw Error("Missing invitation");
      const { data: generated, error: linkError } =
        await admin.auth.admin.generateLink({ type: "magiclink", email });
      expect(linkError).toBeNull();
      if (!generated.properties)
        throw Error("Missing invitation verification link");
      // Render the exact Nodemailer template without sending to an external
      // mailbox. Only the browser consumes this one-use verification token.
      const mail = teamInvitationEmail(
        {
          email,
          hash: generated.properties.hashed_token,
          invitation,
          locale: "en",
        },
        "http://localhost:3000",
      );
      const link = mail.text
        .split("\n")
        .find((line) => line.startsWith("http://"))!;
      expect(mail.text).toContain(invitation.store_names[0]);
      const checksBeforeLink = mfaChecks;
      await page.goto(link);
      await page.getByRole("button", { name: "Verify", exact: true }).click();
      if (!signedIn && scenario.mfa) await completeMfa();
      await expect(page).toHaveURL(/\/account$/);
      const expectedChecks =
        checksBeforeLink + (!signedIn && scenario.mfa ? 1 : 0);
      expect(mfaChecks).toBe(expectedChecks);
      expect(magicLinkVerifications).toBe(signedIn ? 0 : 1);
      await expect(page.locator(".invitation-details")).toContainText(
        invitation.store_names[0],
      );
      await expect(page.locator(".invitation-details")).toContainText(
        role === "staff" ? "Staff" : "Operator",
      );
      await page
        .getByRole("button", { name: "Accept invitation", exact: true })
        .click();
      await expect(page.locator(".invitation-panel")).toContainText(
        "Invitation accepted",
      );
      await expect(page).toHaveURL(/\/account$/);
      expect(mfaChecks).toBe(expectedChecks);
      const { rows: members } = await pool.query(
        "select id,merchant_id,role from public.merchant_memberships where user_id=$1",
        [user.id],
      );
      expect(members).toHaveLength(1);
      expect(members[0].merchant_id).toBe(merchant);
      expect(members[0].role).toBe(role);
      const { rows: assignments } = await pool.query(
        "select store_id from public.merchant_store_assignments where membership_id=$1 and active",
        [members[0].id],
      );
      expect(assignments.map((assignment) => assignment.store_id)).toEqual([
        store,
      ]);
      expect(
        await page.evaluate(() => sessionStorage.getItem("mesa-invitation")),
      ).toBeNull();
      if (scenario.session === "aal2" || (!signedIn && scenario.mfa)) {
        await page
          .locator(".invitation-panel")
          .getByRole("link", { name: "Workplace", exact: true })
          .click();
        await expect(page).toHaveURL(/\/bairro-kitchen\/dashboard\/orders$/);
        expect(mfaChecks).toBe(expectedChecks);
      } else {
        await expect(
          page
            .locator(".invitation-panel")
            .getByRole("link", { name: "Sign in to workplace" }),
        ).toHaveAttribute(
          "href",
          "/auth/sign-in?next=%2Fbairro-kitchen%2Fdashboard",
        );
        if (scenario.mfa) {
          await page
            .locator(".invitation-panel")
            .getByRole("link", { name: "Sign in to workplace" })
            .click();
          await page.getByLabel("Email", { exact: true }).fill(email);
          await page.getByLabel("Password", { exact: true }).fill(password);
          await page
            .getByRole("button", { name: "Sign in", exact: true })
            .click();
          await completeMfa("/bairro-kitchen/dashboard");
          await expect(page).toHaveURL(/\/bairro-kitchen\/dashboard\/orders$/);
          expect(mfaChecks).toBe(expectedChecks + 1);
        } else {
          // Membership acceptance did not weaken the workplace route guard.
          await page.goto("/bairro-kitchen/dashboard");
          await expect(page).toHaveURL(/\/auth\/mfa\?next=/);
        }
      }
      expect(pageErrors).toEqual([]);
    } finally {
      if (invitation) {
        await pool.query(
          "delete from public.merchant_invitation_stores where invitation_id=$1",
          [invitation.id],
        );
        await pool.query(
          "delete from public.merchant_invitations where id=$1",
          [invitation.id],
        );
      }
      await pool.query(
        "delete from public.merchant_store_assignments where membership_id in (select id from public.merchant_memberships where user_id=$1)",
        [user.id],
      );
      await pool.query(
        "delete from public.merchant_memberships where user_id=$1",
        [user.id],
      );
      await pool.query("delete from public.profiles where user_id=$1", [
        user.id,
      ]);
      await admin.auth.admin.deleteUser(user.id);
    }
  });
}
