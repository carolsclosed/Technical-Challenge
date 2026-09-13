import "./env";
import pg from "pg";
const id = process.argv[2];
if (!id || !/^[0-9a-f-]{36}$/i.test(id))
  throw Error("Usage: npm run bootstrap:admin -- VERIFIED_USER_UUID");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query("begin");
  const r = await db.query(
    "select id from auth.users where id=$1 and email_confirmed_at is not null for update",
    [id],
  );
  if (!r.rowCount) throw Error("An existing verified user is required.");
  await db.query(
    "insert into public.platform_admins(user_id) values($1) on conflict(user_id) do update set active=true",
    [id],
  );
  await db.query("commit");
  console.log("Platform admin provisioned. MFA remains mandatory.");
} catch (e) {
  await db.query("rollback");
  throw e;
} finally {
  await db.end();
}
