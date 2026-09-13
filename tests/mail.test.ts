// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  verify: vi.fn(),
  createTransport: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("nodemailer", () => ({
  default: { createTransport: mocks.createTransport },
}));

import { sendMail } from "@/lib/mail";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SMTP_HOST", "smtp.example.test");
  vi.stubEnv("SMTP_PORT", "465");
  vi.stubEnv("SMTP_USER", "sender@example.test");
  vi.stubEnv("SMTP_PASS", "unit-test-password");
  vi.stubEnv("SMTP_FROM", "sender@example.test");
  mocks.createTransport.mockReturnValue({
    sendMail: mocks.sendMail,
    verify: mocks.verify,
  });
});

const message = {
  to: "recipient@example.test",
  subject: "Test message",
  text: "Test message",
};

it("resolves only after the SMTP server accepts the recipient", async () => {
  mocks.sendMail.mockResolvedValue({
    accepted: [message.to],
    rejected: [],
  });
  await expect(sendMail(message)).resolves.toBeUndefined();
});

it("rejects a resolved SMTP response when no recipient was accepted", async () => {
  mocks.sendMail.mockResolvedValue({
    accepted: [],
    rejected: [message.to],
  });
  await expect(sendMail(message)).rejects.toThrow("EMAIL_DELIVERY_REJECTED");
});
