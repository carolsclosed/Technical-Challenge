import { Webhook } from "standardwebhooks";
import { authEmailMessages, authEmailSchema } from "@/lib/auth-email";
import { sendMail } from "@/lib/mail";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET?.replace(/^v1,/, "");
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!secret || !site)
    return Response.json(
      { error: { message: "Email delivery is not configured." } },
      { status: 503 },
    );
  if (Number(request.headers.get("content-length") ?? 0) > 64_000)
    return new Response(null, { status: 413 });
  const body = await request.text();
  if (body.length > 64_000) return new Response(null, { status: 413 });
  let payload: unknown;
  try {
    payload = new Webhook(secret).verify(
      body,
      Object.fromEntries(request.headers),
    );
  } catch {
    return Response.json(
      { error: { message: "Invalid hook signature." } },
      { status: 401 },
    );
  }
  const parsed = authEmailSchema.safeParse(payload);
  if (!parsed.success)
    return Response.json(
      { error: { message: "Invalid email request." } },
      { status: 400 },
    );
  try {
    for (const email of authEmailMessages(parsed.data, site))
      await sendMail(email);
    return Response.json({});
  } catch {
    // Do not return/log SMTP responses, credentials, tokens, or email payloads.
    return Response.json(
      { error: { message: "Email delivery failed." } },
      { status: 502 },
    );
  }
}
