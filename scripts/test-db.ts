import "./env";
import { localOnly } from "./env";
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash, createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
localOnly();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let passed = 0;
const { rows: users } = await pool.query("select id,email from auth.users");
const uid = (name: string) => {
  const u = users.find((u) => u.email === name + "@mesa.test");
  assert.ok(u, `Seed ${name} first`);
  return u.id as string;
};
const merchant1 = "10000000-0000-4000-8000-000000000001",
  merchant2 = "10000000-0000-4000-8000-000000000002";
const product1 = "30000000-0000-4000-8000-000000000011",
  product2 = "30000000-0000-4000-8000-000000000031";
const delivery = {
  name: "Integration Customer",
  phone: "+351912345678",
  country: "PT",
  street: "Rua da Prata 100",
  line2: "",
  city: "Lisboa",
  state: "Lisboa",
  zip_code: "1100-420",
  instructions: "",
};
const items = [
  { product_id: product1, quantity: 2, unit_price_minor: 1190 },
  { product_id: product2, quantity: 1, unit_price_minor: 1190 },
];
async function asUser(c: pg.PoolClient, name: string, aal = "aal2") {
  await c.query("set local role authenticated");
  await c.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: uid(name), role: "authenticated", aal }),
  ]);
}
async function test(name: string, fn: (c: pg.PoolClient) => Promise<void>) {
  const c = await pool.connect();
  await c.query("begin");
  try {
    // Normalize only named development fixtures inside the rolled-back test
    // transaction; preserve all user edits and additional stores afterward.
    await c.query(
      "update public.merchants set status=case when id=$1 or id=$2 then 'active'::public.merchant_status else 'suspended'::public.merchant_status end where id in ($1,$2,'10000000-0000-4000-8000-000000000004')",
      [merchant1, merchant2],
    );
    await c.query(
      "update public.stores set active=(id<>'20000000-0000-4000-8000-000000000005') where id::text like '20000000-0000-4000-8000-%'",
    );
    await c.query(
      "update public.products set price_minor=1190,available=true,archived_at=null where id in ($1,$2,'30000000-0000-4000-8000-000000000021')",
      [product1, product2],
    );
    await c.query(
      "update public.products set available=false where id='30000000-0000-4000-8000-000000000015'",
    );
    await c.query(
      "update public.merchant_memberships mm set active=true,role=case when u.email like 'staff%' then 'staff'::public.member_role when u.email like 'operator%' then 'operator'::public.member_role else 'admin'::public.member_role end from auth.users u where u.id=mm.user_id and u.email in ('admin@mesa.test','admin2@mesa.test','staff@mesa.test','operator@mesa.test')",
    );
    await c.query(
      "update public.merchant_store_assignments a set active=(store_id='20000000-0000-4000-8000-000000000001') from public.merchant_memberships mm where mm.id=a.membership_id and mm.user_id=any($1)",
      [[uid("staff"), uid("operator")]],
    );
    await fn(c);
    passed++;
    console.log("PASS", name);
  } catch (e) {
    console.error("FAIL", name);
    throw e;
  } finally {
    await c.query("rollback");
    c.release();
  }
}
async function fails(
  c: pg.PoolClient,
  sql: string,
  args: unknown[] = [],
  pattern = /FORBIDDEN|permission denied|row-level security|CONFLICT/,
) {
  await c.query("savepoint expected");
  await assert.rejects(c.query(sql, args), pattern);
  await c.query("rollback to savepoint expected");
}
async function place(c: pg.PoolClient, key = randomUUID(), lineItems = items) {
  return (
    await c.query("insert into public.order_submission_commands(idempotency_key,delivery,items) values($1,$2,$3) returning group_id id", [
      key,
      delivery,
      JSON.stringify(lineItems),
    ])
  ).rows[0].id as string;
}
async function transition(
  c: pg.PoolClient,
  orderId: string,
  version: number,
  status: string,
  reason: string | null = null,
) {
  return c.query(
    "insert into public.order_transition_commands(store_order_id,expected_version,requested_status,reason) values($1,$2,$3,$4) returning result_version",
    [orderId, version, status, reason],
  );
}
async function createInvitation(
  c: pg.PoolClient,
  merchantId: string,
  email: string,
  role: string,
  storeIds: string[] = [],
) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const {
    rows: [result],
  } = await c.query(
    "insert into public.invitation_creation_commands(merchant_id,email,role,store_ids,token_hash) values($1,$2,$3,$4,$5) returning invitation_id id,merchant_name,store_names,role",
    [merchantId, email, role, storeIds, tokenHash],
  );
  return { ...result, token };
}
async function previewInvitation(c: pg.PoolClient, token: string) {
  const {
    rows: [result],
  } = await c.query(
    "insert into public.invitation_preview_commands(token) values($1) returning details",
    [token],
  );
  return result.details;
}
async function acceptInvitation(c: pg.PoolClient, token: string) {
  return c.query(
    "insert into public.invitation_acceptance_commands(token) values($1) returning merchant_slug",
    [token],
  );
}
async function expectFailure(
  c: pg.PoolClient,
  operation: () => Promise<unknown>,
  pattern = /FORBIDDEN|permission denied|row-level security|CONFLICT/,
) {
  await c.query("savepoint expected_operation");
  await assert.rejects(operation(), pattern);
  await c.query("rollback to savepoint expected_operation");
}
await test("Anonymous catalog is public but raw tables are not", async (c) => {
  await c.query("set local role anon");
  const { rows: stores } = await c.query("select * from public.catalog_stores");
  assert.ok(stores.length >= 4);
  assert.ok(
    !stores.some((s: { id: string }) =>
      [
        "20000000-0000-4000-8000-000000000005",
        "20000000-0000-4000-8000-000000000006",
      ].includes(s.id),
    ),
  );
  assert.ok(
    stores.every(
      (s: Record<string, unknown>) => !("merchant_id" in s) && !("active" in s),
    ),
  );
  await fails(c, "select * from public.stores");
  await fails(c, "select * from public.merchant_memberships");
});
await test("Tenant isolation and AAL2 enforced directly by RLS", async (c) => {
  await asUser(c, "admin");
  const ownStores = (await c.query("select * from public.stores")).rows;
  assert.ok(ownStores.length >= 2);
  assert.ok(ownStores.every((s) => s.merchant_id === merchant1));
  assert.equal(
    (
      await c.query("select * from public.stores where merchant_id=$1", [
        merchant2,
      ])
    ).rows.length,
    0,
  );
  await asUser(c, "admin", "aal1");
  assert.equal((await c.query("select * from public.stores")).rows.length, 0);
  await fails(
    c,
    "insert into public.products(merchant_id,store_id,name,description,price_minor,available) values($1,$2,'Test','',100,true)",
    [merchant1, "20000000-0000-4000-8000-000000000001"],
  );
});
await test("Operator has narrow availability permission and cannot modify catalog", async (c) => {
  await asUser(c, "operator");
  const {
    rows: [p],
  } = await c.query("select * from public.products where id=$1", [product1]);
  await c.query(
    "update public.products set available=false where id=$1 and version=$2",
    [p.id, p.version],
  );
  await fails(
    c,
    "update public.products set name=$2,description='',price_minor=1,available=true where id=$1",
    [p.id, "Tampered"],
  );
  await fails(c, "update public.products set price_minor=1 where id=$1", [
    p.id,
  ]);
});
await test("SDK table writes are authorized by RLS and column guards", async (c) => {
  const store = "20000000-0000-4000-8000-000000000001";
  await asUser(c, "operator");
  assert.equal(
    (await c.query("update public.products set available=false where id=$1", [
      product1,
    ])).rowCount,
    1,
  );
  await fails(c, "update public.products set name='Operator edit' where id=$1", [
    product1,
  ]);
  await asUser(c, "staff");
  assert.equal(
    (await c.query("update public.products set name='Staff edit' where id=$1", [
      product1,
    ])).rowCount,
    1,
  );
  assert.equal(
    (await c.query("update public.stores set name='Staff store edit' where id=$1", [store]))
      .rowCount,
    0,
  );
  await asUser(c, "admin");
  const invitation = await createInvitation(
    c,
    merchant1,
    "delivery-test@mesa.test",
    "staff",
    [store],
  );
  assert.equal(
    (
      await c.query(
        "update public.merchant_invitations set delivery_state='sent' where id=$1 returning id",
        [invitation.id],
      )
    ).rowCount,
    1,
  );
  await fails(
    c,
    "select token_hash from public.merchant_invitations where id=$1",
    [invitation.id],
  );
  assert.equal(
    (await c.query("update public.stores set name='Admin store edit' where id=$1", [store]))
      .rowCount,
    1,
  );
  assert.equal(
    (await c.query("update public.merchants set name='Admin merchant edit' where id=$1", [merchant1]))
      .rowCount,
    1,
  );
  await asUser(c, "customer", "aal1");
  assert.equal(
    (
      await c.query(
        "update public.profiles set display_name='SDK Customer' where user_id=$1",
        [uid("customer")],
      )
    ).rowCount,
    1,
  );
  await asUser(c, "superadmin");
  const slug = `sdk-${randomUUID()}`;
  assert.equal(
    (
      await c.query(
        "insert into public.merchants(name,slug) values('SDK Merchant',$1)",
        [slug],
      )
    ).rowCount,
    1,
  );
});
await test("Staff cannot manage roles and customers cannot elevate using metadata", async (c) => {
  await asUser(c, "staff");
  await expectFailure(c, () =>
    createInvitation(c, merchant1, "other@mesa.test", "admin"),
  );
  await asUser(c, "customer", "aal1");
  await c.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({
      sub: uid("customer"),
      role: "authenticated",
      aal: "aal2",
      user_metadata: { role: "admin", merchant_id: merchant1 },
    }),
  ]);
  await fails(
    c,
    "insert into public.products(merchant_id,store_id,name,description,price_minor,available) values($1,$2,'Test','',100,true)",
    [merchant1, "20000000-0000-4000-8000-000000000001"],
  );
});
await test("One cart splits atomically with snapshots and integer totals", async (c) => {
  await asUser(c, "customer", "aal1");
  const id = await place(c);
  const { rows: o } = await c.query(
    "select * from public.store_orders where group_id=$1",
    [id],
  );
  assert.equal(o.length, 2);
  assert.deepEqual(o.map((x) => x.subtotal_minor).sort(), ["1190", "2380"]);
  assert.equal(
    (
      await c.query(
        "select submitted_total_minor from public.order_groups where id=$1",
        [id],
      )
    ).rows[0].submitted_total_minor,
    "3570",
  );
  assert.equal(
    (
      await c.query(
        "select count(*) n from public.order_items where store_order_id=any($1)",
        [o.map((x) => x.id)],
      )
    ).rows[0].n,
    "2",
  );
  await asUser(c, "admin");
  const mine = (
    await c.query("select * from public.store_orders where group_id=$1", [id])
  ).rows;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].merchant_id, merchant1);
  assert.equal(
    (await c.query("select * from public.order_groups where id=$1", [id])).rows
      .length,
    0,
  );
  assert.equal(
    (
      await c.query(
        "select * from public.order_items where store_order_id=$1",
        [o.find((x) => x.merchant_id === merchant2).id],
      )
    ).rows.length,
    0,
  );
  await asUser(c, "customer2", "aal1");
  assert.equal(
    (await c.query("select * from public.store_orders where group_id=$1", [id]))
      .rows.length,
    0,
  );
});
await test("Idempotency returns existing group and rejects changed payload", async (c) => {
  await asUser(c, "customer", "aal1");
  const key = randomUUID();
  const first = await place(c, key);
  assert.equal(await place(c, key), first);
  await fails(
    c,
    "insert into public.order_submission_commands(idempotency_key,delivery,items) values($1,$2,$3)",
    [key, delivery, JSON.stringify([{ ...items[0], quantity: 3 }, items[1]])],
    /CONFLICT/,
  );
});
await test("Invalid, repriced and unavailable items roll back entire submission", async (c) => {
  await asUser(c, "customer", "aal1");
  const before = (await c.query("select count(*) n from public.order_groups"))
    .rows[0].n;
  await fails(
    c,
    "insert into public.order_submission_commands(idempotency_key,delivery,items) values($1,$2,$3)",
    [
      randomUUID(),
      delivery,
      JSON.stringify([{ ...items[0], unit_price_minor: 1 }, items[1]]),
    ],
    /CART_CHANGED/,
  );
  await fails(
    c,
    "insert into public.order_submission_commands(idempotency_key,delivery,items) values($1,$2,$3)",
    [
      randomUUID(),
      delivery,
      JSON.stringify([
        ...items,
        {
          product_id: "30000000-0000-4000-8000-000000000015",
          quantity: 1,
          unit_price_minor: 350,
        },
      ]),
    ],
    /CART_CHANGED/,
  );
  assert.equal(
    (await c.query("select count(*) n from public.order_groups")).rows[0].n,
    before,
  );
});
await test("Status sequence, repeat handling and immutable snapshots", async (c) => {
  await asUser(c, "customer", "aal1");
  const gid = await place(c);
  await asUser(c, "admin");
  const {
    rows: [o],
  } = await c.query("select * from public.store_orders where group_id=$1", [
    gid,
  ]);
  await expectFailure(c, () => transition(c, o.id, 1, "delivered"), /CONFLICT/);
  let version = 1;
  for (const status of [
    "accepted",
    "preparing",
    "out_for_delivery",
    "delivered",
  ]) {
    await transition(c, o.id, version++, status);
    await transition(c, o.id, version - 1, status);
  }
  assert.equal(
    (
      await c.query(
        "select count(*) n from public.order_status_events where store_order_id=$1",
        [o.id],
      )
    ).rows[0].n,
    "5",
  );
  const {
    rows: [p],
  } = await c.query("select * from public.products where id=$1", [product1]);
  await c.query(
    "update public.products set name='Changed product',description='',price_minor=999,available=true where id=$1 and version=$2",
    [p.id, p.version],
  );
  assert.equal(
    (
      await c.query(
        "select unit_price_minor from public.order_items where store_order_id=$1",
        [o.id],
      )
    ).rows[0].unit_price_minor,
    1190,
  );
  await fails(
    c,
    "update public.order_items set quantity=2 where store_order_id=$1",
    [o.id],
  );
});
await test("Only placed orders can be cancelled and sibling orders remain placed", async (c) => {
  await asUser(c, "customer", "aal1");
  const gid = await place(c);
  const { rows: o } = await c.query(
    "select * from public.store_orders where group_id=$1 order by store_id",
    [gid],
  );
  await transition(c, o[0].id, 1, "cancelled");
  await transition(c, o[0].id, 1, "cancelled");
  await asUser(c, "admin2");
  await transition(c, o[1].id, 1, "accepted");
  await asUser(c, "customer", "aal1");
  await expectFailure(c, () => transition(c, o[1].id, 2, "cancelled"), /CONFLICT/);
});
await test("Suspension prevents new orders but allows fulfillment", async (c) => {
  await asUser(c, "customer", "aal1");
  const gid = await place(c);
  await asUser(c, "superadmin");
  await c.query("update public.merchants set status='suspended' where id=$1", [merchant1]);
  await asUser(c, "customer", "aal1");
  await fails(
    c,
    "insert into public.order_submission_commands(idempotency_key,delivery,items) values($1,$2,$3)",
    [randomUUID(), delivery, JSON.stringify(items)],
    /CART_CHANGED/,
  );
  await asUser(c, "operator");
  const {
    rows: [o],
  } = await c.query("select * from public.store_orders where group_id=$1", [
    gid,
  ]);
  await transition(c, o.id, 1, "accepted");
  assert.equal(
    (await c.query("update public.products set available=false where id=$1 and version=1", [product1])).rowCount,
    0,
  );
});
await test("Last admin and immediate membership revocation", async (c) => {
  await asUser(c, "admin");
  const {
    rows: [me],
  } = await c.query(
    "select * from public.merchant_memberships where user_id=$1",
    [uid("admin")],
  );
  await expectFailure(
    c,
    () => c.query("insert into public.member_change_commands(membership_id,role,active) values($1,'staff',true)", [me.id]),
    /LAST_ADMIN_REQUIRED/,
  );
  const {
    rows: [staff],
  } = await c.query(
    "select * from public.merchant_memberships where user_id=$1",
    [uid("staff")],
  );
  await c.query("insert into public.member_change_commands(membership_id,role,active) values($1,'staff',false)", [staff.id]);
  await asUser(c, "staff");
  assert.equal((await c.query("select * from public.stores")).rows.length, 0);
});
await test("Verified invitation acceptance at AAL1 preserves AAL2 workplace security and single use", async (c) => {
  const store = "20000000-0000-4000-8000-000000000001";
  await asUser(c, "admin");
  await expectFailure(
    c,
    () => createInvitation(c, merchant1, "customer2@mesa.test", "operator", ["20000000-0000-4000-8000-000000000003"]),
    /VALIDATION_ERROR/,
  );
  const invitation = await createInvitation(
    c,
    merchant1,
    "customer2@mesa.test",
    "operator",
    [store],
  );
  assert.equal(invitation.role, "operator");
  assert.equal(invitation.store_names.length, 1);
  await asUser(c, "customer", "aal1");
  await expectFailure(c, () => previewInvitation(c, invitation.token), /INVITATION_EMAIL_MISMATCH/);
  await expectFailure(c, () => acceptInvitation(c, invitation.token), /INVITATION_EMAIL_MISMATCH/);
  await c.query("set local role anon");
  await fails(
    c,
    "insert into public.invitation_preview_commands(token) values($1)",
    [invitation.token],
    /permission denied/,
  );
  await fails(
    c,
    "insert into public.invitation_acceptance_commands(token) values($1)",
    [invitation.token],
    /permission denied/,
  );
  await c.query("reset role");
  await c.query("update auth.users set email_confirmed_at=null where id=$1", [
    uid("customer2"),
  ]);
  await asUser(c, "customer2", "aal1");
  await expectFailure(c, () => previewInvitation(c, invitation.token), /FORBIDDEN/);
  await expectFailure(c, () => acceptInvitation(c, invitation.token), /FORBIDDEN/);
  await c.query("reset role");
  await c.query("update auth.users set email_confirmed_at=now() where id=$1", [
    uid("customer2"),
  ]);
  // Isolate the invitation exception from customer_ok: even an enabled factor
  // does not demand another challenge from an existing verified AAL1 session.
  // This factor exists only inside this rolled-back transaction.
  await c.query(
    "insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at) values(gen_random_uuid(),$1,'Invitation regression','totp','verified',now(),now())",
    [uid("customer2")],
  );
  await asUser(c, "customer2", "aal1");
  assert.equal(
    (await c.query("select private.customer_ok() allowed")).rows[0].allowed,
    false,
  );
  const preview = await previewInvitation(c, invitation.token);
  assert.deepEqual(preview.store_names, invitation.store_names);
  assert.ok(!("token_hash" in preview));
  await acceptInvitation(c, invitation.token);
  assert.equal((await c.query("select id from public.stores")).rows.length, 0);
  assert.equal(
    (await c.query("update public.products set available=false where id=$1 and version=1", [product1])).rowCount,
    0,
  );
  await expectFailure(c, () => acceptInvitation(c, invitation.token), /INVITATION_INVALID/);
  await asUser(c, "customer2");
  assert.deepEqual(
    (await c.query("select id from public.stores")).rows.map((row) => row.id),
    [store],
  );
  await expectFailure(c, () => acceptInvitation(c, invitation.token), /INVITATION_INVALID/);
});
await test("Impossible invitations are stopped before sending without changing existing membership", async (c) => {
  await asUser(c, "admin");
  await expectFailure(c, () => createInvitation(c, merchant1, "admin2@mesa.test", "staff"), /INVITATION_ACCOUNT_IN_USE/);
  await expectFailure(c, () => createInvitation(c, merchant1, "superadmin@mesa.test", "staff"), /INVITATION_ACCOUNT_IN_USE/);
  await expectFailure(c, () => createInvitation(c, merchant1, "staff@mesa.test", "operator"), /INVITATION_ALREADY_MEMBER/);
  const invitation = await createInvitation(c, merchant1, "customer2@mesa.test", "staff");
  // A recipient may join another business after this invitation was sent.
  await c.query("reset role");
  await c.query(
    "insert into public.merchant_memberships(merchant_id,user_id,role) values($1,$2,'admin')",
    [merchant2, uid("customer2")],
  );
  await asUser(c, "customer2");
  await expectFailure(c, () => previewInvitation(c, invitation.token), /INVITATION_ACCOUNT_IN_USE/);
  await expectFailure(c, () => acceptInvitation(c, invitation.token), /INVITATION_ACCOUNT_IN_USE/);
  assert.equal(
    (
      await c.query(
        "select merchant_id from public.merchant_memberships where user_id=auth.uid()",
      )
    ).rows[0].merchant_id,
    merchant2,
  );
});
await test("Expired and revoked invitation links cannot grant membership", async (c) => {
  await asUser(c, "admin");
  const invitation = await createInvitation(c, merchant1, "customer2@mesa.test", "staff");
  await c.query("reset role");
  await c.query("select set_config('request.jwt.claims','{}',true)");
  await c.query(
    "update public.merchant_invitations set expires_at=now()-interval '1 second' where id=$1",
    [invitation.id],
  );
  await asUser(c, "customer2", "aal1");
  await expectFailure(c, () => previewInvitation(c, invitation.token), /INVITATION_INVALID/);
  await expectFailure(c, () => acceptInvitation(c, invitation.token), /INVITATION_INVALID/);
  await c.query("reset role");
  await c.query("select set_config('request.jwt.claims','{}',true)");
  await c.query(
    "update public.merchant_invitations set expires_at=now()+interval '7 days',revoked_at=now() where id=$1",
    [invitation.id],
  );
  await asUser(c, "customer2", "aal1");
  await expectFailure(c, () => previewInvitation(c, invitation.token), /INVITATION_INVALID/);
  await expectFailure(c, () => acceptInvitation(c, invitation.token), /INVITATION_INVALID/);
});
await test("Staff cannot create, rename or deactivate a store", async (c) => {
  await asUser(c, "staff");
  await fails(
    c,
    "insert into public.stores(merchant_id,name,street,city,state,zip_code,phone,timezone,active) values($1,'Forbidden store','Rua 10','Lisboa','Lisboa','1000-001','+351912345678','Europe/Lisbon',true)",
    [merchant1],
  );
  const {
    rows: [store],
  } = await c.query("select * from public.stores order by id limit 1");
  assert.ok(store);
  assert.equal(
    (await c.query("update public.stores set name='Renamed by staff',active=false where id=$1 and version=$2", [store.id, store.version])).rowCount,
    0,
  );
  const {
    rows: [product],
  } = await c.query(
    "insert into public.products(merchant_id,store_id,name,description,price_minor,available) values($1,$2,'Staff product','Assigned store only',100,true) returning id",
    [merchant1, store.id],
  );
  await c.query("update public.products set archived_at=now(),available=false where id=$1 and version=1", [product.id]);
  await fails(
    c,
    "insert into public.products(merchant_id,store_id,name,description,price_minor,available) values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','Not assigned','',100,true)",
  );
});
await test("Store assignments constrain product and order reads and mutations", async (c) => {
  await asUser(c, "customer", "aal1");
  const group = await place(c, randomUUID(), [
    { product_id: product1, quantity: 1, unit_price_minor: 1190 },
    {
      product_id: "30000000-0000-4000-8000-000000000021",
      quantity: 1,
      unit_price_minor: 1190,
    },
  ]);
  const { rows: orders } = await c.query(
    "select * from public.store_orders where group_id=$1 order by store_id",
    [group],
  );
  assert.equal(orders.length, 2);
  await asUser(c, "operator");
  assert.equal(
    (
      await c.query("select * from public.store_orders where group_id=$1", [
        group,
      ])
    ).rows.length,
    1,
  );
  assert.equal(
    (
      await c.query(
        "select * from public.products where store_id='20000000-0000-4000-8000-000000000002'",
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (await c.query("update public.products set available=false where id=$1 and version=1", ["30000000-0000-4000-8000-000000000021"])).rowCount,
    0,
  );
  await expectFailure(c, () => transition(c, orders[1].id, 1, "accepted"));
  await transition(c, orders[0].id, 1, "accepted");
});
await test("Admin assignment changes are immediate and cannot cross merchants", async (c) => {
  await asUser(c, "admin");
  const {
    rows: [staff],
  } = await c.query(
    "select * from public.merchant_memberships where user_id=$1",
    [uid("staff")],
  );
  await fails(c, "insert into public.member_store_commands(membership_id,store_ids) values($1,$2)", [staff.id, ["20000000-0000-4000-8000-000000000003"]], /VALIDATION_ERROR/);
  await c.query("insert into public.member_store_commands(membership_id,store_ids) values($1,$2)", [staff.id, ["20000000-0000-4000-8000-000000000002"]]);
  await asUser(c, "staff");
  assert.deepEqual(
    (await c.query("select id from public.stores")).rows.map((row) => row.id),
    ["20000000-0000-4000-8000-000000000002"],
  );
  await fails(c, "insert into public.member_store_commands(membership_id,store_ids) values($1,$2)", [staff.id, []]);
  await asUser(c, "admin");
  await c.query("insert into public.member_store_commands(membership_id,store_ids) values($1,$2)", [staff.id, []]);
  await asUser(c, "staff");
  assert.equal((await c.query("select * from public.stores")).rowCount, 0);
});
await test("Super admin administers all merchant teams with MFA and preserves customer privacy", async (c) => {
  await asUser(c, "superadmin");
  const { rows: team } = await c.query(
    "select id,email from public.merchant_memberships where merchant_id=$1 order by email",
    [merchant1],
  );
  assert.ok(
    team.some(
      (member: { email: string }) => member.email === "staff@mesa.test",
    ),
  );
  assert.ok(
    (await c.query("select id from public.merchant_memberships where merchant_id=$1", [merchant2]))
      .rows.length > 0,
  );
  const staff = team.find(
    (member: { email: string }) => member.email === "staff@mesa.test",
  );
  await c.query("insert into public.member_change_commands(membership_id,role,active) values($1,'staff',false)", [staff.id]);
  assert.equal(
    (
      await c.query(
        "select * from public.store_orders where customer_id<>auth.uid()",
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await c.query(
        "select * from public.order_groups where customer_id<>auth.uid()",
      )
    ).rowCount,
    0,
  );
  await asUser(c, "superadmin", "aal1");
  assert.equal((await c.query("select id from public.merchant_memberships where merchant_id=$1", [merchant1])).rows.length, 0);
  await asUser(c, "admin");
  assert.equal((await c.query("select id from public.merchant_memberships where merchant_id=$1", [merchant2])).rows.length, 0);
});
await test("Merchant candidacy requires approval and candidates are super-admin-only", async (c) => {
  await asUser(c, "customer2");
  const {
    rows: [application],
  } = await c.query("insert into public.merchant_application_commands(name,slug) values('Application Test','application-test') returning merchant_id id");
  assert.equal((await c.query("update public.merchants set status='active' where id=$1", [application.id])).rowCount, 0);
  await fails(
    c,
    "insert into public.stores(merchant_id,name,street,city,state,zip_code,phone,timezone,active) values($1,'Too early','Rua 10','Lisboa','Lisboa','1000-001','+351912345678','Europe/Lisbon',true)",
    [application.id],
  );
  await asUser(c, "superadmin");
  const { rows: candidates } = await c.query("select id,applicant_email from public.merchants where status in ('pending','rejected') and applicant_id is not null");
  assert.ok(
    candidates.some(
      (candidate: { id: string }) => candidate.id === application.id,
    ),
  );
  await c.query("update public.merchants set status='rejected',rejection_reason='Please update business name' where id=$1", [application.id]);
  await asUser(c, "customer2");
  await c.query("update public.merchants set name='Updated Business',status='pending',rejection_reason=null where id=$1", [application.id]);
  await asUser(c, "superadmin");
  await c.query("update public.merchants set status='active' where id=$1", [application.id]);
  await asUser(c, "customer2");
  await c.query(
    "insert into public.stores(merchant_id,name,street,city,state,zip_code,phone,timezone,active) values($1,'Approved store','Rua 10','Lisboa','Lisboa','1000-001','+351912345678','Europe/Lisbon',true)",
    [application.id],
  );
  await asUser(c, "staff");
  assert.equal((await c.query("select id from public.merchants where applicant_id is not null and status in ('pending','rejected')")).rows.length, 0);
});
// Real HTTP sessions and real TOTP enrollment, not fabricated JWTs.
function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret.replace(/=+$/, ""))
    bits += alphabet.indexOf(ch.toUpperCase()).toString(2).padStart(5, "0");
  const key = Buffer.from(
    (bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", key).update(counter).digest();
  const offset = hash.at(-1)! & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
const adminApi = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const email = `mfa-test-${randomUUID()}@mesa.test`;
const { data: newUser, error: createError } =
  await adminApi.auth.admin.createUser({
    email,
    password: "Integration!Pass2026",
    email_confirm: true,
  });
if (createError) throw createError;
const testUser = newUser.user!;
await pool.query(
  "insert into public.merchant_memberships(merchant_id,user_id,role) values($1,$2,'operator')",
  [merchant1, testUser.id],
);
const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: false } },
);
try {
  await pool.query(
    "insert into public.merchant_store_assignments(merchant_id,membership_id,store_id) select merchant_id,id,'20000000-0000-4000-8000-000000000001' from public.merchant_memberships where user_id=$1",
    [testUser.id],
  );
  const login = await client.auth.signInWithPassword({
    email,
    password: "Integration!Pass2026",
  });
  assert.equal(login.error, null);
  assert.equal((await client.from("stores").select("*")).data?.length, 0);
  const { data: factor, error } = await client.auth.mfa.enroll({
    factorType: "totp",
  });
  assert.equal(error, null);
  assert.ok(factor);
  const verified = await client.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: totp(factor.totp.secret),
  });
  assert.equal(verified.error, null);
  assert.equal(
    (await client.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel,
    "aal2",
  );
  assert.equal((await client.from("stores").select("*")).data?.length, 1);
  passed++;
  console.log(
    "PASS Real Supabase password + TOTP elevates AAL and unlocks assigned-store RLS",
  );
} finally {
  await pool.query(
    "delete from public.merchant_store_assignments where membership_id in (select id from public.merchant_memberships where user_id=$1)",
    [testUser.id],
  );
  await pool.query("delete from public.merchant_memberships where user_id=$1", [
    testUser.id,
  ]);
  await pool.query("delete from public.profiles where user_id=$1", [
    testUser.id,
  ]);
  await adminApi.auth.admin.deleteUser(testUser.id);
}
// Concurrent callers exercise locks on committed records, then retain this legitimate test order.
const concurrentKey = randomUUID();
async function concurrentPlace() {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await asUser(c, "customer", "aal1");
    const id = await place(c, concurrentKey);
    await c.query("commit");
    return id;
  } finally {
    c.release();
  }
}
const [a, b] = await Promise.all([concurrentPlace(), concurrentPlace()]);
assert.equal(a, b);
passed++;
console.log("PASS Concurrent submission creates exactly one group");
const {
  rows: [raceOrder],
} = await pool.query(
  "select * from public.store_orders where group_id=$1 and merchant_id=$2",
  [a, merchant1],
);
async function race(name: string, sql: string) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await asUser(c, name, name === "customer" ? "aal1" : "aal2");
    await c.query(sql, [raceOrder.id]);
    await c.query("commit");
    return true;
  } catch {
    await c.query("rollback");
    return false;
  } finally {
    c.release();
  }
}
const raceResults = await Promise.all([
  race(
    "customer",
    "insert into public.order_transition_commands(store_order_id,expected_version,requested_status) values($1,1,'cancelled')",
  ),
  race(
    "admin",
    "insert into public.order_transition_commands(store_order_id,expected_version,requested_status) values($1,1,'accepted')",
  ),
]);
assert.equal(raceResults.filter(Boolean).length, 1);
passed++;
console.log("PASS Concurrent cancellation / acceptance has exactly one winner");
await pool.end();
console.log(`${passed} database/security integration scenarios passed.`);
