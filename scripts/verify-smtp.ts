import "./env";
import { verifySmtp } from "../src/lib/mail";

try {
  await verifySmtp();
  console.log("SMTP connection and credentials verified. No email was sent.");
} catch {
  console.error(
    "SMTP verification failed. Check SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS. Provider error details are intentionally omitted.",
  );
  process.exitCode = 1;
}
