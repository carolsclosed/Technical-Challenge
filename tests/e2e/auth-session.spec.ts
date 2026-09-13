import { localOnly } from "../../scripts/env";
import { createHmac, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { test, expect, type Page } from "@playwright/test";

localOnly();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const password = "BrowserSession!2026";
const firstStore =
  "/bairro-kitchen/stores/20000000-0000-4000-8000-000000000001";
const secondStore = "/verde-co/stores/20000000-0000-4000-8000-000000000003";

async function createUser() {
  const email = `session-${randomUUID()}@mesa.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user)
    throw Error("Could not create local session test user");
  return { id: data.user.id, email };
}
async function removeUsers(ids: string[]) {
  await pool.query(
    "delete from public.merchant_store_assignments where membership_id in (select id from public.merchant_memberships where user_id=any($1))",
    [ids],
  );
  await pool.query(
    "delete from public.merchant_memberships where user_id=any($1)",
    [ids],
  );
  await pool.query("delete from public.profiles where user_id=any($1)", [ids]);
  for (const id of ids) await admin.auth.admin.deleteUser(id);
}
async function login(page: Page, email: string, next = "/cart") {
  await page.goto(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
async function logout(page: Page) {
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3000/");
}
async function addProduct(page: Page, store: string, index = 0) {
  await page.goto(store);
  const candidate = page
    .locator(".product-card")
    .filter({ has: page.getByRole("button", { name: "Add", exact: true }) })
    .nth(index);
  const name = await candidate.getByRole("heading").innerText();
  const product = page
    .locator(".product-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) })
    .first();
  await product.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    product.getByRole("button", { name: "Added to cart", exact: true }),
  ).toBeDisabled();
  return name;
}
async function saveProfile(page: Page, name: string) {
  const input = page.getByLabel("Name", { exact: true });
  await expect(input).toBeEnabled();
  await input.fill(name);
  const submitted = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/account" &&
      response.request().method() === "POST" &&
      !!response.request().headers()["next-action"],
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  expect((await submitted).status()).toBe(200);
  await expect(page).toHaveURL("http://localhost:3000/account");
  await expect(page.getByText("Saved successfully")).toBeVisible();
}
async function verificationLinkFor(email: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const response = await fetch("http://127.0.0.1:54324/api/v1/messages");
    if (response.ok) {
      const list = (await response.json()) as {
        messages?: {
          ID: string;
          To?: { Address: string }[];
          Subject?: string;
        }[];
      };
      const message = list.messages?.find(
        (candidate) =>
          candidate.Subject === "Verify your email — mesa." &&
          candidate.To?.some((recipient) => recipient.Address === email),
      );
      if (message) {
        const detailResponse = await fetch(
          `http://127.0.0.1:54324/api/v1/message/${message.ID}`,
        );
        const detail = (await detailResponse.json()) as { Text?: string };
        const link = detail.Text?.split(/\r?\n/).find((line) =>
          line.startsWith("http://localhost:3000/auth/verify#"),
        );
        if (link) return link;
      }
    }
    await delay(100);
  }
  throw Error("Local signup verification email was not delivered");
}
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

test("new customer can register, receive the branded email, verify, and open the created profile", async ({
  page,
}) => {
  const email = `signup-${randomUUID()}@mesa.test`;
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await page.goto("/auth/sign-up?next=%2Faccount");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page
      .getByLabel("Password", { exact: true })
      .fill("SignupRegression!2026");
    const signup = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/auth/v1/signup",
    );
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    expect((await signup).status()).toBe(200);
    await expect(page.getByRole("status")).toHaveText(
      "Check your email for the next step.",
    );

    await page.goto(await verificationLinkFor(email));
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await expect(page.getByLabel("Name", { exact: true })).toBeEnabled();
    const { rows } = await pool.query(
      "select u.id,u.email_confirmed_at,p.user_id profile_id from auth.users u left join public.profiles p on p.user_id=u.id where u.email=$1",
      [email],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].email_confirmed_at).not.toBeNull();
    expect(rows[0].profile_id).toBe(rows[0].id);
    expect(pageErrors).toEqual([]);
  } finally {
    const { rows } = await pool.query(
      "select id from auth.users where email=$1",
      [email],
    );
    if (rows[0]?.id) await removeUsers([rows[0].id]);
  }
});

test("guest cart transfers to A, B stays isolated, and A restores without delivery data", async ({
  page,
}) => {
  const a = await createUser();
  const b = await createUser();
  try {
    const first = await addProduct(page, firstStore);
    await login(page, a.email);
    await expect(page).toHaveURL(/\/cart$/);
    await expect(
      page.locator(".cart-item").getByText(first, { exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Review order" }).click();
    await page
      .getByLabel("Name", { exact: true })
      .fill("Private delivery name");
    await page.getByLabel("Street address").fill("Private delivery street");
    const deliveryValues = await page.evaluate(() =>
      Object.entries(localStorage)
        .filter(([key]) => key.startsWith("mesa-cart"))
        .map(([, value]) => value)
        .join(""),
    );
    expect(deliveryValues).not.toContain("Private delivery");
    await logout(page);
    await page.goto("/cart");
    await expect(
      page.getByText("Your next favourite meal is waiting."),
    ).toBeVisible();
    await login(page, b.email);
    await expect(
      page.getByText("Your next favourite meal is waiting."),
    ).toBeVisible();
    const second = await addProduct(page, secondStore, 1);
    expect(second).not.toBe(first);
    await page.goto("/cart");
    await expect(
      page.locator(".cart-item").getByText(second, { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".cart-item").getByText(first, { exact: true }),
    ).toHaveCount(0);
    await logout(page);
    await login(page, a.email, "/checkout");
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(
      page.locator(".cart-item").getByText(first, { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".cart-item").getByText(second, { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Street address")).toHaveValue("");
    await page.reload();
    await expect(
      page.locator(".cart-item").getByText(first, { exact: true }),
    ).toBeVisible();
  } finally {
    await removeUsers([a.id, b.id]);
  }
});

test("one login TOTP unlocks later customer actions and merchant navigation in the same session", async ({
  page,
}) => {
  test.setTimeout(120000);
  const user = await createUser();
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  try {
    await pool.query(
      "insert into public.merchant_memberships (merchant_id,user_id,role) values ('10000000-0000-4000-8000-000000000001',$1,'operator')",
      [user.id],
    );
    await pool.query(
      "insert into public.merchant_store_assignments(merchant_id,membership_id,store_id) select merchant_id,id,'20000000-0000-4000-8000-000000000001' from public.merchant_memberships where user_id=$1",
      [user.id],
    );
    expect(
      (await client.auth.signInWithPassword({ email: user.email, password }))
        .error,
    ).toBeNull();
    const { data: factor, error } = await client.auth.mfa.enroll({
      factorType: "totp",
    });
    expect(error).toBeNull();
    if (!factor) throw Error("Missing local test factor");
    expect(
      (
        await client.auth.mfa.challengeAndVerify({
          factorId: factor.id,
          code: totp(factor.totp.secret),
        })
      ).error,
    ).toBeNull();
    const enrollmentStep = Math.floor(Date.now() / 30000);
    await client.auth.signOut();
    expect(
      (await client.auth.signInWithPassword({ email: user.email, password }))
        .error,
    ).toBeNull();
    expect((await client.from("stores").select("id")).data).toEqual([]);
    const deniedAvailability = await client
      .from("products")
      .update({ available: false })
      .eq("id", "30000000-0000-4000-8000-000000000011")
      .eq("version", 1)
      .select("id");
    // RLS hides unauthorized rows, so PostgREST reports an empty update rather
    // than exposing whether the target product exists.
    expect(deniedAvailability.error).toBeNull();
    expect(deniedAvailability.data).toEqual([]);
    const { rows: unchangedProducts } = await pool.query(
      "select available from public.products where id='30000000-0000-4000-8000-000000000011'",
    );
    expect(unchangedProducts[0]?.available).toBe(true);
    await client.auth.signOut();

    let challenges = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        /\/factors\/[^/]+\/challenge$/.test(request.url())
      )
        challenges++;
    });
    await login(page, user.email, "/account");
    await expect(page).toHaveURL(/\/auth\/mfa\?next=%2Faccount$/);
    await expect(
      page.getByRole("button", { name: "Verify", exact: true }),
    ).toBeEnabled();
    if (Math.floor(Date.now() / 30000) === enrollmentStep)
      await delay(30050 - (Date.now() % 30000));
    await page
      .getByLabel("Authentication code", { exact: true })
      .fill(totp(factor.totp.secret));
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(page).toHaveURL(/\/account$/);
    await saveProfile(page, "Verified session");
    await page
      .locator(".desktop-nav")
      .getByRole("link", { name: "My orders", exact: true })
      .click();
    await expect(page).toHaveURL(/\/orders$/);
    await page
      .locator(".desktop-nav")
      .getByRole("link", { name: "Account", exact: true })
      .click();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
      "Verified session",
    );
    await saveProfile(page, "Still verified");
    await page
      .locator(".desktop-nav")
      .getByRole("link", { name: "Workplace", exact: true })
      .click();
    await expect(page).toHaveURL(/\/bairro-kitchen\/dashboard\/orders$/);
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page
      .locator(".sidebar")
      .getByRole("link", { name: "Products", exact: true })
      .click();
    await expect(page).toHaveURL(/\/bairro-kitchen\/dashboard\/stores$/);
    await page.reload();
    await expect(page).toHaveURL(/\/bairro-kitchen\/dashboard\/stores$/);
    expect(challenges).toBe(1);
  } finally {
    await removeUsers([user.id]);
  }
});
