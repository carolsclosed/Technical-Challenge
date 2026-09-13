// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createInvitation: vi.fn(),
  generateLink: vi.fn(),
  sendMail: vi.fn(),
  teamInvitationEmail: vi.fn(() => ({
    to: "worker@example.com",
    subject: "Invitation",
    text: "Invitation",
  })),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  serverClient: async () => ({ from: mocks.from }),
}));
vi.mock("@/lib/business-commands", () => ({
  businessCommands: { createInvitation: mocks.createInvitation },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { admin: { generateLink: mocks.generateLink } },
  }),
}));
vi.mock("@/lib/mail", () => ({ sendMail: mocks.sendMail }));
vi.mock("@/lib/auth-email", () => ({
  teamInvitationEmail: mocks.teamInvitationEmail,
}));

import { invite } from "@/app/actions/business";

const invitation = {
  id: "22222222-2222-4222-8222-222222222222",
  token: "a".repeat(64),
  merchant_name: "Bairro Kitchen",
  store_names: ["Bairro Alfama"],
  role: "staff" as const,
};
const input = {
  merchant: "11111111-1111-4111-8111-111111111111",
  email: "worker@example.com",
  role: "staff" as const,
  stores: ["33333333-3333-4333-8333-333333333333"],
  locale: "en" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://mesa.example");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "unit-test-service-key");
  mocks.createInvitation.mockResolvedValue({ data: invitation, error: null });
  mocks.generateLink.mockResolvedValue({
    data: { properties: { hashed_token: "valid-link-token-hash-for-tests" } },
    error: null,
  });
  mocks.sendMail.mockResolvedValue(undefined);
  mocks.maybeSingle.mockResolvedValue({
    data: { id: invitation.id },
    error: null,
  });
  mocks.select.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  mocks.eq.mockReturnValue({ select: mocks.select });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.from.mockReturnValue({ update: mocks.update });
});

it("reports a successful SMTP send after persisting the sent state", async () => {
  await expect(invite(input)).resolves.toEqual({ ok: true });
  expect(mocks.sendMail).toHaveBeenCalledOnce();
  expect(mocks.from).toHaveBeenCalledWith("merchant_invitations");
  expect(mocks.update).toHaveBeenCalledWith({ delivery_state: "sent" });
  expect(mocks.eq).toHaveBeenCalledWith("id", invitation.id);
  expect(mocks.select).toHaveBeenCalledWith("id");
});

it("records a genuine SMTP failure and never reports success", async () => {
  mocks.sendMail.mockRejectedValue(new Error("private SMTP response"));
  await expect(invite(input)).resolves.toEqual({
    ok: false,
    error: "inviteFailed",
  });
  expect(mocks.update).toHaveBeenCalledWith({ delivery_state: "failed" });
});

it("does not misreport a delivered email when state persistence fails", async () => {
  mocks.maybeSingle.mockResolvedValue({
    data: null,
    error: { message: "private database response" },
  });
  await expect(invite(input)).resolves.toEqual({
    ok: false,
    error: "inviteSentStateFailed",
  });
  expect(mocks.sendMail).toHaveBeenCalledOnce();
});
