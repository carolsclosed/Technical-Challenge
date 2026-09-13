import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { parseEnv } from "node:util";
const path = ".env.local";
let text = fs.existsSync(path) ? fs.readFileSync(path, "utf8") : "";
const existing = parseEnv(text);
const status = JSON.parse(
  execFileSync("node_modules/.bin/supabase", ["status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
const defaults = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    status.PUBLISHABLE_KEY || status.ANON_KEY,
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  DATABASE_URL: status.DB_URL,
};
for (const [key, value] of Object.entries(defaults)) {
  if (existing[key]?.trim()) continue;
  const pattern = new RegExp("^" + key + "=.*$", "m");
  const line = key + "=" + value;
  text = pattern.test(text)
    ? text.replace(pattern, () => line)
    : text.trimEnd() + "\n" + line + "\n";
}
fs.writeFileSync(path, text.trimStart(), { mode: 0o600 });
fs.chmodSync(path, 0o600);
console.log(
  "Filled missing local connection settings; existing environment values were preserved.",
);
