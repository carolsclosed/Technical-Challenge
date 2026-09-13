import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { loadEnvFile } from "node:process";
import { parseEnv } from "node:util";

// This command only starts local Docker services. Its hook secret belongs to
// this checkout; hosted Supabase projects must use their own generated secret.
const path = ".env.local";
let text = fs.existsSync(path) ? fs.readFileSync(path, "utf8") : "";
const values = parseEnv(text);
function setMissing(key, value) {
  if (values[key]?.trim()) return;
  const pattern = new RegExp("^" + key + "=.*$", "m");
  const line = key + "=" + value;
  text = pattern.test(text)
    ? text.replace(pattern, () => line)
    : text.trimEnd() + "\n" + line + "\n";
  values[key] = value;
}
setMissing(
  "SEND_EMAIL_HOOK_SECRET",
  "v1,whsec_" + randomBytes(32).toString("base64"),
);
if (!values.SMTP_HOST && !values.SMTP_USER && !values.SMTP_PASS) {
  setMissing("SMTP_HOST", "127.0.0.1");
  setMissing("SMTP_PORT", "54325");
  setMissing("SMTP_FROM", "mesa@local.test");
  setMissing("SMTP_FROM_NAME", "mesa.");
  setMissing("SMTP_ALLOW_LOCAL", "true");
}
fs.writeFileSync(path, text.trimStart(), { mode: 0o600 });
fs.chmodSync(path, 0o600);
loadEnvFile(path);
// The Auth service and Next.js must use the same local signing secret.
process.env.SEND_EMAIL_HOOK_SECRET = values.SEND_EMAIL_HOOK_SECRET;

console.log(
  "Starting local Supabase with the configured email hook. Existing data is preserved.",
);
const child = spawn(
  process.platform === "win32" ? "supabase.cmd" : "supabase",
  ["start"],
  {
    env: process.env,
    // CLI startup summaries contain local API credentials. Keep them out of logs.
    stdio: ["inherit", "ignore", "ignore"],
  },
);
child.on("error", () => {
  console.error(
    "Could not launch Supabase. Run npm ci and check that Docker is running.",
  );
  process.exitCode = 1;
});
child.on("exit", (code) => {
  if (code === 0)
    console.log(
      "Local Supabase is ready. Start Next.js before using authentication email flows.",
    );
  else {
    console.error(
      "Local Supabase failed to start. Check Docker and supabase/config.toml.",
    );
    process.exitCode = code ?? 1;
  }
});
