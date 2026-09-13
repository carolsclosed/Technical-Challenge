import { renderToString } from "react-dom/server";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Account } from "@/components/account";

const {
  mutate,
  readInvitation,
  navigateAfterAuth,
  push,
  getAssurance,
  getUser,
} = vi.hoisted(() => ({
  mutate: vi.fn(),
  readInvitation: vi.fn(),
  navigateAfterAuth: vi.fn(),
  push: vi.fn(),
  getAssurance: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("@/app/actions/business", () => ({ mutate, readInvitation }));
vi.mock("@/lib/auth-navigation", () => ({ navigateAfterAuth }));
vi.mock("@/components/providers", () => ({ useApp: () => ({ locale: "en" }) }));
vi.mock("@/components/header", () => ({ SignOut: () => null }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "dark" }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/supabase/client", () => ({
  browserClient: () => ({
    auth: {
      getUser,
      mfa: {
        listFactors: async () => ({ data: { totp: [] } }),
        getAuthenticatorAssuranceLevel: getAssurance,
      },
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mutate.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "invitee" } }, error: null });
  sessionStorage.clear();
  window.history.replaceState(null, "", "/account");
});
afterEach(cleanup);

it("disables the server-rendered profile form until its submit handler is hydrated", () => {
  const html = renderToString(
    <Account name="" email="customer@example.com" privileged={false} />,
  );
  const document = new DOMParser().parseFromString(html, "text/html");
  expect(
    document.querySelector('input[name="name"]')?.hasAttribute("disabled"),
  ).toBe(true);
  expect(document.querySelector("form button")?.hasAttribute("disabled")).toBe(
    true,
  );
});

it("submits a hydrated profile once, locks pending edits, and reports completion", async () => {
  let finish: (value: unknown) => void = () => {};
  mutate.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await act(async () => {
    render(<Account name="" email="customer@example.com" privileged={false} />);
  });
  const input = screen.getByLabelText("name") as HTMLInputElement;
  expect(input.disabled).toBe(false);
  fireEvent.change(input, { target: { value: "Verified session" } });
  fireEvent.submit(input.closest("form")!);
  expect(mutate).toHaveBeenCalledExactlyOnceWith("profile", {
    name: "Verified session",
    locale: "en",
    theme: "dark",
  });
  expect(input.disabled).toBe(true);
  expect(
    (screen.getByRole("button", { name: "loading" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await act(async () => {
    finish({ ok: true });
  });
  expect(screen.getByRole("status").textContent).toBe("saved");
  expect(input.disabled).toBe(false);
});

it.each(["aal1", "aal2"])(
  "accepts with the existing %s session without starting another MFA challenge",
  async (level) => {
    const token = "a".repeat(64);
    sessionStorage.setItem("mesa-invitation", token);
    readInvitation.mockResolvedValue({
      ok: true,
      data: {
        merchant_name: "Bairro",
        store_names: ["Alfama"],
        role: "staff",
        expires_at: "2026-09-20T00:00:00Z",
      },
    });
    getAssurance.mockResolvedValue({ data: { currentLevel: level } });
    mutate.mockResolvedValue({ ok: true, data: "bairro-kitchen" });
    await act(async () => {
      render(<Account name="" email="staff@example.com" privileged={false} />);
    });
    expect(screen.getByText("Alfama")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "acceptInvitation" }));
    });
    expect(mutate).toHaveBeenCalledExactlyOnceWith("acceptInvitation", {
      token,
    });
    expect(sessionStorage.getItem("mesa-invitation")).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(navigateAfterAuth).not.toHaveBeenCalled();
    expect(screen.getByText("invitationAccepted")).toBeTruthy();
    expect(
      screen
        .getByRole("link", {
          name: level === "aal2" ? "workspace" : "signInWorkspace",
        })
        .getAttribute("href"),
    ).toBe(
      level === "aal2"
        ? "/bairro-kitchen/dashboard"
        : "/auth/sign-in?next=%2Fbairro-kitchen%2Fdashboard",
    );
  },
);

it("returns an expired session to normal sign-in and keeps the invitation for after login", async () => {
  const token = "c".repeat(64);
  getUser.mockResolvedValue({ data: { user: null } });
  readInvitation.mockResolvedValue({
    ok: true,
    data: {
      merchant_name: "Bairro",
      store_names: ["Alfama"],
      role: "staff",
      expires_at: "2026-09-20T00:00:00Z",
    },
  });
  await act(async () => {
    render(
      <Account
        name=""
        email="staff@example.com"
        invitation={token}
        privileged={false}
      />,
    );
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "acceptInvitation" }));
  });
  expect(navigateAfterAuth).toHaveBeenCalledWith(
    "/auth/sign-in?next=%2Faccount",
  );
  expect(sessionStorage.getItem("mesa-invitation")).toBe(token);
  expect(mutate).not.toHaveBeenCalled();
});

it("keeps the committed success when assurance lookup fails and offers a safe sign-in action", async () => {
  readInvitation.mockResolvedValue({
    ok: true,
    data: {
      merchant_name: "Bairro",
      store_names: ["Alfama"],
      role: "staff",
      expires_at: "2026-09-20T00:00:00Z",
    },
  });
  mutate.mockResolvedValue({ ok: true, data: "bairro-kitchen" });
  getAssurance.mockRejectedValue(new Error("Unavailable"));
  await act(async () => {
    render(
      <Account
        name=""
        email="staff@example.com"
        invitation={"d".repeat(64)}
        privileged={false}
      />,
    );
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "acceptInvitation" }));
  });
  expect(screen.getByText("invitationAccepted")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("button", { name: "acceptInvitation" })).toBeNull();
  expect(
    screen.getByRole("link", { name: "signInWorkspace" }).getAttribute("href"),
  ).toBe("/auth/sign-in?next=%2Fbairro-kitchen%2Fdashboard");
  expect(navigateAfterAuth).not.toHaveBeenCalled();
  expect(sessionStorage.getItem("mesa-invitation")).toBeNull();
});

it("explains an existing membership and prevents an impossible acceptance retry", async () => {
  readInvitation.mockResolvedValue({
    ok: false,
    error: "INVITATION_ACCOUNT_IN_USE",
  });
  await act(async () => {
    render(
      <Account
        name=""
        email="admin@example.com"
        invitation={"b".repeat(64)}
        privileged
      />,
    );
  });
  expect(screen.getByRole("alert").textContent).toBe(
    "INVITATION_ACCOUNT_IN_USE",
  );
  expect(screen.queryByRole("button", { name: "acceptInvitation" })).toBeNull();
  expect(mutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "invitationDismiss" }));
  expect(sessionStorage.getItem("mesa-invitation")).toBeNull();
});
