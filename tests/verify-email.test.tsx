import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VerifyEmail } from "@/components/verify-email";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  verifyOtp: vi.fn(),
  assurance: vi.fn(),
  readInvitation: vi.fn(),
  navigate: vi.fn(),
  suspend: vi.fn(),
  resume: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  browserClient: () => ({
    auth: {
      getUser: mocks.getUser,
      verifyOtp: mocks.verifyOtp,
      mfa: { getAuthenticatorAssuranceLevel: mocks.assurance },
    },
  }),
}));
vi.mock("@/app/actions/business", () => ({
  readInvitation: mocks.readInvitation,
}));
vi.mock("@/lib/auth-navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-navigation")>()),
  navigateAfterAuth: mocks.navigate,
}));
vi.mock("@/components/providers", () => ({
  useApp: () => ({ suspendCart: mocks.suspend, resumeCart: mocks.resume }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const token = "a".repeat(64);
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  const hash = new URLSearchParams({
    token_hash: "valid-magic-link-token-hash",
    type: "magiclink",
    next: `/account#invitation=${token}`,
  });
  window.history.replaceState(null, "", "/auth/verify#" + hash);
  mocks.getUser.mockResolvedValue({ data: { user: { id: "invitee" } } });
  mocks.readInvitation.mockResolvedValue({
    ok: true,
    data: { merchant_name: "Bairro" },
  });
  mocks.verifyOtp.mockResolvedValue({ error: null });
  mocks.assurance.mockResolvedValue({
    data: { currentLevel: "aal1", nextLevel: "aal2" },
    error: null,
  });
  mocks.resume.mockResolvedValue(undefined);
});
afterEach(cleanup);

async function openLink() {
  await act(async () => {
    render(<VerifyEmail />);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "verify" }));
  });
}

it("preserves a logged-in recipient session instead of consuming a magic link and downgrading AAL2", async () => {
  await openLink();
  expect(mocks.readInvitation).toHaveBeenCalledWith(token);
  expect(mocks.verifyOtp).not.toHaveBeenCalled();
  expect(mocks.assurance).not.toHaveBeenCalled();
  expect(mocks.navigate).toHaveBeenCalledWith("/account");
  expect(sessionStorage.getItem("mesa-invitation")).toBe(token);
});

it("does not switch a logged-in different account into the invited identity", async () => {
  mocks.readInvitation.mockResolvedValue({
    ok: false,
    error: "INVITATION_EMAIL_MISMATCH",
  });
  await openLink();
  expect(mocks.verifyOtp).not.toHaveBeenCalled();
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toBe(
    "INVITATION_EMAIL_MISMATCH",
  );
});

it("requires an MFA-enabled logged-out recipient to complete MFA as part of signing in", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  await openLink();
  expect(mocks.verifyOtp).toHaveBeenCalledWith({
    token_hash: "valid-magic-link-token-hash",
    type: "magiclink",
  });
  expect(mocks.navigate).toHaveBeenCalledWith("/auth/mfa?next=%2Faccount");
  expect(sessionStorage.getItem("mesa-invitation")).toBe(token);
});

it("signs a logged-out recipient without an enabled factor in directly to acceptance", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  mocks.assurance.mockResolvedValue({
    data: { currentLevel: "aal1", nextLevel: "aal1" },
    error: null,
  });
  await openLink();
  expect(mocks.verifyOtp).toHaveBeenCalledOnce();
  expect(mocks.readInvitation).not.toHaveBeenCalled();
  expect(mocks.navigate).toHaveBeenCalledWith("/account");
  expect(sessionStorage.getItem("mesa-invitation")).toBe(token);
});

it.each(["FORBIDDEN", "INVITATION_INVALID"])(
  "does not consume the login link when the current recipient is rejected with %s",
  async (error) => {
    mocks.readInvitation.mockResolvedValue({ ok: false, error });
    await openLink();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(error);
  },
);

it("reports a failed login link and does not continue into acceptance", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  mocks.verifyOtp.mockResolvedValue({ error: new Error("expired") });
  await openLink();
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toBe("emailLinkInvalid");
});
