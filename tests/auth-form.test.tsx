import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthForm, Mfa } from "@/components/auth-form";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  aal: vi.fn(),
  getUser: vi.fn(),
  listFactors: vi.fn(),
  verify: vi.fn(),
  navigate: vi.fn(),
  suspend: vi.fn(),
  resume: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  browserClient: () => ({
    auth: {
      signInWithPassword: mocks.signIn,
      signUp: mocks.signUp,
      getUser: mocks.getUser,
      mfa: {
        getAuthenticatorAssuranceLevel: mocks.aal,
        listFactors: mocks.listFactors,
        challengeAndVerify: mocks.verify,
      },
    },
  }),
}));
vi.mock("@/lib/auth-navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-navigation")>()),
  navigateAfterAuth: mocks.navigate,
}));
vi.mock("@/components/providers", () => ({
  useApp: () => ({
    locale: "en",
    suspendCart: mocks.suspend,
    resumeCart: mocks.resume,
  }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams({ next: "/orders" }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.signIn.mockResolvedValue({ error: null });
  mocks.signUp.mockResolvedValue({
    data: { user: { id: "new-user" }, session: null },
    error: null,
  });
  mocks.aal.mockResolvedValue({
    data: { currentLevel: "aal1", nextLevel: "aal1" },
    error: null,
  });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "A" } }, error: null });
  mocks.listFactors.mockResolvedValue({
    data: { totp: [{ id: "factor", status: "verified" }] },
    error: null,
  });
  mocks.verify.mockResolvedValue({ error: null });
  mocks.resume.mockResolvedValue(undefined);
});
afterEach(cleanup);

async function signIn() {
  render(<AuthForm mode="sign-in" />);
  fireEvent.change(screen.getByLabelText("email"), {
    target: { value: "customer@example.com" },
  });
  fireEvent.change(screen.getByLabelText("password"), {
    target: { value: "Test!Password123" },
  });
  await act(async () => {
    fireEvent.submit(screen.getByLabelText("email").closest("form")!);
  });
}

async function signUp() {
  render(<AuthForm mode="sign-up" />);
  fireEvent.change(screen.getByLabelText("email"), {
    target: { value: "new-customer@example.com" },
  });
  fireEvent.change(screen.getByLabelText("password"), {
    target: { value: "Test!Password123" },
  });
  await act(async () => {
    fireEvent.submit(screen.getByLabelText("email").closest("form")!);
  });
}

it("reports a completed email-confirmation sign-up independently of cart identity refresh", async () => {
  // This is the regression: cart identity resolution used to run after
  // sign-up and could overwrite a successful Auth result with authError.
  mocks.resume.mockRejectedValueOnce(new Error("unrelated cart lookup"));
  await signUp();
  expect(mocks.signUp).toHaveBeenCalledWith({
    email: "new-customer@example.com",
    password: "Test!Password123",
    options: {
      emailRedirectTo: "http://localhost:3000/auth/callback?next=%2Forders",
      data: { locale: "en" },
    },
  });
  expect(mocks.suspend).not.toHaveBeenCalled();
  expect(mocks.resume).not.toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toBe("checkEmail");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("shows the registration-specific error when Supabase rejects sign-up", async () => {
  mocks.signUp.mockResolvedValueOnce({
    data: { user: null, session: null },
    error: new Error("rejected"),
  });
  await signUp();
  expect(screen.getByRole("alert").textContent).toBe("signUpError");
  expect(screen.queryByRole("status")).toBeNull();
});

it("challenges a verified factor immediately after password login, preserving the destination", async () => {
  mocks.aal.mockResolvedValue({
    data: { currentLevel: "aal1", nextLevel: "aal2" },
    error: null,
  });
  await signIn();
  expect(mocks.navigate).toHaveBeenCalledWith("/auth/mfa?next=%2Forders");
  expect(mocks.suspend).toHaveBeenCalledOnce();
  expect(mocks.resume).toHaveBeenCalledOnce();
  expect(mocks.navigate.mock.invocationCallOrder[0]).toBeGreaterThan(
    mocks.resume.mock.invocationCallOrder[0],
  );
});

it("sends customers without MFA directly to their requested page", async () => {
  await signIn();
  expect(mocks.navigate).toHaveBeenCalledWith("/orders");
});

it("stays on sign-in when session assurance cannot be established", async () => {
  mocks.aal.mockResolvedValue({ data: null, error: new Error("Unavailable") });
  await signIn();
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toBe("authError");
});

it("completes one challenge and skips it on subsequent visits with the same AAL2 session", async () => {
  mocks.aal.mockResolvedValue({
    data: { currentLevel: "aal1", nextLevel: "aal2" },
    error: null,
  });
  render(<Mfa />);
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "verify" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.change(screen.getByLabelText("code"), {
    target: { value: "123456" },
  });
  await act(async () => {
    fireEvent.submit(screen.getByLabelText("code").closest("form")!);
  });
  expect(mocks.verify).toHaveBeenCalledWith({
    factorId: "factor",
    code: "123456",
  });
  expect(mocks.navigate).toHaveBeenLastCalledWith("/orders");
  cleanup();
  mocks.aal.mockResolvedValue({
    data: { currentLevel: "aal2", nextLevel: "aal2" },
    error: null,
  });
  render(<Mfa />);
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(2));
  expect(mocks.verify).toHaveBeenCalledOnce();
});
