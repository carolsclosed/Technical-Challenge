import { loadEnvFile } from "node:process";
try {
  loadEnvFile(".env.local");
} catch {}
export function localOnly() {
  const url = process.env.DATABASE_URL ?? "";
  if (
    !/^postgres(?:ql)?:\/\/[^@]+@(127\.0\.0\.1|localhost):54322\//.test(url) ||
    !/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    )
  )
    throw Error("This command runs only against local Supabase.");
}
