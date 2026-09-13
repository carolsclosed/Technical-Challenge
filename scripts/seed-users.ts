import "./env";
import { localOnly } from "./env";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
localOnly();
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const password = process.env.SEED_PASSWORD ?? "LocalMesa!2026";
const users = [
  ["superadmin", null, null],
  ["admin", 1, "admin"],
  ["staff", 1, "staff"],
  ["operator", 1, "operator"],
  ["admin2", 2, "admin"],
  ["staff2", 2, "staff"],
  ["operator2", 2, "operator"],
  ["pending", 3, "admin"],
  ["suspended", 4, "admin"],
  ["customer", null, null],
  ["customer2", null, null],
] as const;
const listed = await admin.auth.admin.listUsers({ perPage: 1000 });
const ids: Record<string, string> = {};
for (const [name, merchant, role] of users) {
  const email = `${name}@mesa.test`;
  let user = listed.data.users.find((u) => u.email === email);
  if (!user) {
    const r = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (r.error) throw r.error;
    user = r.data.user;
  }
  ids[name] = user.id;
  if (name === "superadmin")
    await db.query(
      "insert into public.platform_admins(user_id) values($1) on conflict do nothing",
      [user.id],
    );
  if (merchant) {
    const mid = `10000000-0000-4000-8000-${String(merchant).padStart(12, "0")}`;
    await db.query(
      "insert into public.merchant_memberships(merchant_id,user_id,role) values($1,$2,$3) on conflict(user_id) do nothing",
      [mid, user.id, role],
    );
    if (name === "pending")
      await db.query(
        "update public.merchants set applicant_id=$1 where id=$2",
        [user.id, mid],
      );
  }
}
// Deterministic local store assignments: employees initially work at the first
// store of their merchant. Admins always have all their merchant stores.
await db.query(`insert into public.merchant_store_assignments(merchant_id,membership_id,store_id)
  select mm.merchant_id,mm.id,s.id from public.merchant_memberships mm
  join auth.users u on u.id=mm.user_id
  join lateral (select id from public.stores where merchant_id=mm.merchant_id order by id limit 1) s on true
  where u.email in ('staff@mesa.test','operator@mesa.test','staff2@mesa.test','operator2@mesa.test')
  on conflict(membership_id,store_id) do nothing`);
// Seed order history with transaction-local claims; no MFA factors or bypass in the application.
const delivery = {
  name: "Alex Customer",
  phone: "+351912345678",
  country: "PT",
  street: "Rua da Prata 100",
  line2: "2º",
  city: "Lisboa",
  state: "Lisboa",
  zip_code: "1100-420",
  instructions: "Ring the doorbell.",
};
const statusRank: Record<string, number> = {
  placed: 0,
  accepted: 1,
  preparing: 2,
  out_for_delivery: 3,
  delivered: 4,
  rejected: 4,
  cancelled: 4,
};
for (let i = 0; i < 7; i++) {
  await db.query("begin");
  try {
    await db.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: ids.customer, role: "authenticated", aal: "aal1" }),
    ]);
    const items = [
      {
        product_id: "30000000-0000-4000-8000-000000000011",
        quantity: 2,
        unit_price_minor: 1190,
      },
      {
        product_id: "30000000-0000-4000-8000-000000000031",
        quantity: 1,
        unit_price_minor: 1190,
      },
    ];
    const key = `40000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
    const {
      rows: [g],
    } = await db.query("insert into public.order_submission_commands(idempotency_key,delivery,items) values($1,$2,$3) returning group_id id", [
      key,
      delivery,
      JSON.stringify(items),
    ]);
    const { rows: orders } = await db.query(
      "select * from public.store_orders where group_id=$1 order by store_id",
      [g.id],
    );
    const sequence = [
      [],
      ["accepted"],
      ["accepted", "preparing"],
      ["accepted", "preparing", "out_for_delivery"],
      ["accepted", "preparing", "out_for_delivery", "delivered"],
      ["rejected"],
      ["cancelled"],
    ][i];
    for (const order of orders) {
      for (const status of sequence) {
        const customer = status === "cancelled";
        await db.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({
            sub: customer
              ? ids.customer
              : order.merchant_id.endsWith("1")
                ? ids.admin
                : ids.admin2,
            role: "authenticated",
            aal: customer ? "aal1" : "aal2",
          }),
        ]);
        const {
          rows: [latest],
        } = await db.query(
          "select version,status from public.store_orders where id=$1",
          [order.id],
        );
        if (
          latest.status === status ||
          statusRank[latest.status] >= statusRank[status]
        )
          continue;
        if (customer)
          await db.query("insert into public.order_transition_commands(store_order_id,expected_version,requested_status) values($1,$2,'cancelled')", [
            order.id,
            latest.version,
          ]);
        else
          await db.query("insert into public.order_transition_commands(store_order_id,expected_version,requested_status,reason) values($1,$2,$3,$4)", [
            order.id,
            latest.version,
            status,
            status === "rejected" ? "Kitchen capacity reached" : null,
          ]);
      }
    }
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}
await db.end();
console.log(
  "Local users and seven multi-merchant order groups seeded. See README for local accounts.",
);
