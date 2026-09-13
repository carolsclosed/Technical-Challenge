import { describe, expect, it } from "vitest";
import { Webhook } from "standardwebhooks";
import {
  authEmailMessages,
  authEmailSchema,
  teamInvitationEmail,
} from "@/lib/auth-email";

const hash = "test-token-hash-that-is-long-enough";
const base = {
  user: { email: "customer@example.com" },
  email_data: {
    email_action_type: "signup",
    token_hash: hash,
    redirect_to: "https://mesa.example/auth/callback?next=%2Forders",
  },
};

function verificationUrl(text: string) {
  return new URL(text.split("\n").find((line) => line.startsWith("https://"))!);
}

describe("authentication email delivery contract", () => {
  it.each(["en", "pt-PT"] as const)(
    "identifies invited stores and role with one safe acceptance link in %s",
    (locale) => {
      const token = "b".repeat(64);
      const mail = teamInvitationEmail(
        {
          email: base.user.email,
          hash,
          locale,
          invitation: {
            id: "test",
            token,
            merchant_name: "Bairro Kitchen",
            store_names: ["Bairro Alfama", "Bairro Chiado"],
            role: "operator",
          },
        },
        "https://mesa.example",
      );
      expect(mail.subject).toContain("Bairro Alfama, Bairro Chiado");
      expect(mail.text).toContain("Bairro Kitchen");
      expect(mail.text).toContain(
        locale === "en" ? "as operator" : "como operador",
      );
      expect(mail.text).toContain(
        locale === "en" ? "Accept invitation" : "Aceitar convite",
      );
      const link = verificationUrl(mail.text);
      expect(link.pathname).toBe("/auth/verify");
      expect(link.search).toBe("");
      const params = new URLSearchParams(link.hash.slice(1));
      expect(params.get("token_hash")).toBe(hash);
      expect(params.get("next")).toBe(`/account#invitation=${token}`);
      expect(mail.html).toContain('href="https://mesa.example/auth/verify#');
    },
  );

  it("escapes merchant-authored content in invitation HTML and supports initial admins", () => {
    const mail = teamInvitationEmail(
      {
        email: base.user.email,
        hash,
        locale: "en",
        invitation: {
          id: "test",
          token: "a".repeat(64),
          merchant_name: "<img src=x onerror=alert(1)>",
          store_names: [],
          role: "admin",
        },
      },
      "https://mesa.example",
    );
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;img");
    expect(mail.text).toContain("manage all stores");
  });
  it("keeps verification secrets in a URL fragment and preserves safe destinations", () => {
    const [mail] = authEmailMessages(base, "https://mesa.example");
    const link = verificationUrl(mail.text);
    expect(link.pathname).toBe("/auth/verify");
    expect(link.search).toBe("");
    expect(new URLSearchParams(link.hash.slice(1)).get("token_hash")).toBe(
      hash,
    );
    expect(new URLSearchParams(link.hash.slice(1)).get("next")).toBe("/orders");
    expect(mail.to).toBe("customer@example.com");
    expect(mail.html).toContain("mesa.");
    expect(mail.html).toContain("Confirm your email");
    expect(mail.html).toContain("Verify email");
  });

  it.each([
    ["signup", "Verify email"],
    ["recovery", "Reset password"],
    ["invite", "Accept invitation"],
    ["magiclink", "Sign in"],
  ])("uses the branded HTML and a text alternative for %s", (type, cta) => {
    const [mail] = authEmailMessages(
      {
        ...base,
        email_data: { ...base.email_data, email_action_type: type },
      },
      "https://mesa.example",
    );
    expect(mail.html).toContain("background:#f6f5ef");
    expect(mail.html).toContain(`>${cta}<`);
    expect(mail.text).toContain(cta);
    expect(mail.text).toContain("https://mesa.example/auth/verify#");
  });

  it("rejects off-site redirects and forces recovery to the password form", () => {
    const [signup] = authEmailMessages(
      {
        ...base,
        email_data: {
          ...base.email_data,
          redirect_to: "https://evil.example/steal",
        },
      },
      "https://mesa.example",
    );
    expect(
      new URLSearchParams(verificationUrl(signup.text).hash.slice(1)).get(
        "next",
      ),
    ).toBe("/");
    const [recovery] = authEmailMessages(
      {
        ...base,
        email_data: {
          ...base.email_data,
          email_action_type: "recovery",
          redirect_to: "https://evil.example",
        },
      },
      "https://mesa.example",
    );
    expect(
      new URLSearchParams(verificationUrl(recovery.text).hash.slice(1)).get(
        "next",
      ),
    ).toBe("/auth/reset-password");
  });

  it("uses the correct current/new email hashes for secure email changes", () => {
    const messages = authEmailMessages(
      {
        ...base,
        user: { ...base.user, new_email: "new@example.com" },
        email_data: {
          ...base.email_data,
          email_action_type: "email_change",
          token_hash_new: "current-email-hash-long-enough",
        },
      },
      "https://mesa.example",
    );
    expect(messages.map((mail) => mail.to)).toEqual([
      "new@example.com",
      "customer@example.com",
    ]);
    expect(
      new URLSearchParams(verificationUrl(messages[0].text).hash.slice(1)).get(
        "token_hash",
      ),
    ).toBe(hash);
    expect(
      new URLSearchParams(verificationUrl(messages[1].text).hash.slice(1)).get(
        "token_hash",
      ),
    ).toBe("current-email-hash-long-enough");
    expect(messages.every((mail) => mail.html?.includes("mesa."))).toBe(true);
    expect(
      messages.every((mail) => mail.html?.includes("Confirm new email")),
    ).toBe(true);
  });

  it("does not turn unknown hook payloads into arbitrary email sends", () => {
    expect(
      authEmailSchema.safeParse({
        user: { email: "bad-address" },
        email_data: base.email_data,
      }).success,
    ).toBe(false);
    expect(() =>
      authEmailMessages(
        {
          ...base,
          email_data: { ...base.email_data, email_action_type: "arbitrary" },
        },
        "https://mesa.example",
      ),
    ).toThrow("EMAIL_ACTION_UNSUPPORTED");
  });

  it.each([
    "password_changed_notification",
    "mfa_factor_enrolled_notification",
    "mfa_factor_unenrolled_notification",
    "email_changed_notification",
  ])(
    "sends %s as an informational security notice without authentication secrets",
    (type) => {
      const messages = authEmailMessages(
        {
          ...base,
          user: { ...base.user, user_metadata: { locale: "pt-PT" } },
          email_data: { email_action_type: type },
        },
        "https://mesa.example",
      );
      expect(messages).toHaveLength(1);
      expect(messages[0].subject).toBe("Segurança da conta — mesa.");
      expect(messages[0].to).toBe(base.user.email);
      expect(messages[0].text).not.toContain("token");
      expect(messages[0].text).not.toContain("https://");
      expect(messages[0].html).toContain("Atualização de segurança da conta");
    },
  );

  it("uses the branded code treatment for reauthentication", () => {
    const [mail] = authEmailMessages(
      {
        ...base,
        email_data: {
          email_action_type: "reauthentication",
          token: "123456",
        },
      },
      "https://mesa.example",
    );
    expect(mail.text).toContain("Confirmation code: 123456");
    expect(mail.html).toContain("letter-spacing:7px");
    expect(mail.html).toContain("123456");
  });

  it("preserves a one-use invitation fragment across email verification", () => {
    const invitation = "a".repeat(64);
    const [mail] = authEmailMessages(
      {
        ...base,
        email_data: {
          ...base.email_data,
          email_action_type: "magiclink",
          redirect_to: `https://mesa.example/account#invitation=${invitation}`,
        },
      },
      "https://mesa.example",
    );
    const link = verificationUrl(mail.text);
    expect(link.search).toBe("");
    expect(new URLSearchParams(link.hash.slice(1)).get("next")).toBe(
      `/account#invitation=${invitation}`,
    );
  });

  it("requires a valid, recent Supabase hook signature before using a payload", () => {
    const webhook = new Webhook(
      Buffer.from("test-only-signing-secret-32-bytes").toString("base64"),
    );
    const payload = JSON.stringify(base);
    const now = new Date();
    const headers = {
      "webhook-id": "test-message",
      "webhook-timestamp": String(Math.floor(now.getTime() / 1000)),
      "webhook-signature": webhook.sign("test-message", now, payload),
    };
    expect(webhook.verify(payload, headers)).toEqual(base);
    expect(() =>
      webhook.verify(payload.replace("customer", "attacker"), headers),
    ).toThrow();
    expect(() => webhook.verify(payload, {})).toThrow();
    expect(() =>
      webhook.verify(payload, { ...headers, "webhook-timestamp": "1" }),
    ).toThrow();
  });
});
