// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Webhook } from "standardwebhooks";
import { POST } from "@/app/api/auth/email/route";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock("@/lib/mail", () => ({ sendMail }));
const secret = Buffer.from("test-only-hook-secret-for-unit-tests").toString(
  "base64",
);
const payload = {
  user: { email: "customer@example.com" },
  email_data: {
    email_action_type: "signup",
    token_hash: "unit-test-token-hash-that-is-long-enough",
  },
};

function request(value: unknown = payload, signed = true) {
  const body = JSON.stringify(value);
  const timestamp = new Date();
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (signed)
    Object.assign(headers, {
      "webhook-id": "unit-test-message",
      "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "webhook-signature": new Webhook(secret).sign(
        "unit-test-message",
        timestamp,
        body,
      ),
    });
  return new Request("https://mesa.example/api/auth/email", {
    method: "POST",
    headers,
    body,
  });
}

beforeEach(() => {
  vi.stubEnv("SEND_EMAIL_HOOK_SECRET", `v1,whsec_${secret}`);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://mesa.example");
  sendMail.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

it("fails closed when the hook signing secret is missing", async () => {
  vi.stubEnv("SEND_EMAIL_HOOK_SECRET", "");
  expect((await POST(request())).status).toBe(503);
  expect(sendMail).not.toHaveBeenCalled();
});

it("rejects unsigned requests without contacting SMTP", async () => {
  expect((await POST(request(payload, false))).status).toBe(401);
  expect(sendMail).not.toHaveBeenCalled();
});

it("delivers only a valid signed Auth message", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(sendMail).toHaveBeenCalledOnce();
  expect(sendMail.mock.calls[0][0]).toMatchObject({
    to: "customer@example.com",
    subject: "Verify your email — mesa.",
  });
});

it("does not return SMTP details or report success when delivery fails", async () => {
  sendMail.mockRejectedValue(
    new Error("provider details that must stay private"),
  );
  const response = await POST(request());
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain("provider details");
});
