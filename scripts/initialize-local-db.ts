import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { localOnly } from "./env";

localOnly();

execFileSync(
  "node_modules/.bin/supabase",
  ["migration", "up", "--local"],
  { stdio: "inherit" },
);

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

try {
  await db.query("begin");
  await db.query(
    "select pg_advisory_xact_lock(hashtext('mesa-local-catalog-seed'))",
  );

  const { rows } = await db.query<{ count: string }>(
    "select count(*) from public.merchants",
  );

  if (Number(rows[0]?.count ?? 0) === 0) {
    const seed = await readFile("supabase/seed.sql", "utf8");
    await db.query(seed);
    console.log("Loaded the local catalog fixtures from supabase/seed.sql.");
  } else {
    console.log("Local business data already exists; catalog seed skipped.");
  }

  await db.query("commit");
} catch (error) {
  await db.query("rollback");
  throw error;
} finally {
  await db.end();
}
