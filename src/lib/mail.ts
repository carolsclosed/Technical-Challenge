import "server-only";
import nodemailer from "nodemailer";

let transport: ReturnType<typeof nodemailer.createTransport> | undefined;

function mailTransport() {
  if (transport) return transport;
  const host = process.env.SMTP_HOST ?? "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT ?? "465");
  const user = process.env.SMTP_USER?.trim();
  // Gmail displays app passwords in groups of four characters.
  const pass = process.env.SMTP_PASS?.replace(/\s/g, "");
  const local =
    process.env.NODE_ENV !== "production" &&
    process.env.SMTP_ALLOW_LOCAL === "true" &&
    ["localhost", "127.0.0.1", "::1"].includes(host);
  if (
    (!local && (!user || !pass)) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw Error("EMAIL_NOT_CONFIGURED");
  transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: !local && port !== 465,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 10_000,
    logger: false,
    debug: false,
  });
  return transport;
}

export async function sendMail({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim();
  if (!from) throw Error("EMAIL_NOT_CONFIGURED");
  const info = await mailTransport().sendMail({
    from: { name: process.env.SMTP_FROM_NAME ?? "mesa.", address: from },
    to,
    subject,
    text,
    html,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  // A resolved SMTP command can still report every recipient as rejected.
  // Treat delivery as successful only after the upstream server accepted at
  // least one envelope recipient and did not reject any recipient.
  const accepted = Array.isArray(info.accepted) ? info.accepted : [];
  const rejected = Array.isArray(info.rejected) ? info.rejected : [];
  if (accepted.length === 0 || rejected.length > 0)
    throw Error("EMAIL_DELIVERY_REJECTED");
}

export async function verifySmtp() {
  await mailTransport().verify();
}
