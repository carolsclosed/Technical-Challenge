import React, { useEffect } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Providers, useApp } from "@/components/providers";
import { accountCartKey, guestCartKey } from "@/lib/cart-session";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
  subscribe: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  browserClient: () => ({
    auth: {
      getUser: mocks.getUser,
      getSession: mocks.getSession,
      onAuthStateChange: mocks.subscribe,
    },
  }),
}));
vi.mock("@/lib/auth-navigation", () => ({ navigateAfterAuth: mocks.navigate }));
vi.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("next-themes", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

type AuthEvent = (
  event: string,
  session: { user: { id: string } } | null,
) => void;
let authEvent: AuthEvent;
let current: ReturnType<typeof useApp>;
const first = {
  product_id: "30000000-0000-4000-8000-000000000011",
  quantity: 2,
};
const second = {
  product_id: "30000000-0000-4000-8000-000000000031",
  quantity: 1,
};
function CartProbe() {
  const value = useApp();
  useEffect(() => {
    current = value;
  }, [value]);
  return (
    <>
      <output>{value.ready ? JSON.stringify(value.lines) : "resolving"}</output>
      <button onClick={() => value.setLines([first])}>Add</button>
    </>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.subscribe.mockImplementation((callback: AuthEvent) => {
    authEvent = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});
afterEach(cleanup);

it("does not expose a stored cart until the authenticated user has been verified", async () => {
  localStorage.setItem(accountCartKey("A"), JSON.stringify({ lines: [first] }));
  let complete: (value: unknown) => void = () => {};
  mocks.getUser.mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  render(
    <Providers locale="en">
      <CartProbe />
    </Providers>,
  );
  act(() => authEvent("INITIAL_SESSION", { user: { id: "A" } }));
  expect(screen.getByRole("status").textContent).toBe("resolving");
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(screen.getByRole("status").textContent).toBe("resolving");
  await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());
  await act(async () => {
    complete({ data: { user: { id: "A" } }, error: null });
  });
  expect(screen.getByRole("status").textContent).toBe(JSON.stringify([first]));
});

it("clears memory immediately when accounts switch, rejects late updates, and reloads stale page identity", async () => {
  localStorage.setItem(accountCartKey("A"), JSON.stringify({ lines: [first] }));
  localStorage.setItem(
    accountCartKey("B"),
    JSON.stringify({ lines: [second] }),
  );
  mocks.getUser.mockResolvedValue({ data: { user: { id: "A" } }, error: null });
  render(
    <Providers locale="en">
      <CartProbe />
    </Providers>,
  );
  act(() => authEvent("INITIAL_SESSION", { user: { id: "A" } }));
  await waitFor(() => expect(current.lines).toEqual([first]));
  const staleUpdate = current.setLines;
  mocks.getUser.mockResolvedValue({ data: { user: { id: "B" } }, error: null });
  act(() => authEvent("SIGNED_IN", { user: { id: "B" } }));
  expect(current.lines).toEqual([]);
  expect(current.ready).toBe(false);
  await waitFor(() => expect(current.lines).toEqual([second]));
  expect(staleUpdate([first])).toBe(false);
  expect(current.lines).toEqual([second]);
  expect(mocks.navigate).toHaveBeenCalledOnce();
});

it("waits for a local sign-in cart transfer before navigating and handles queued auth events", async () => {
  render(
    <Providers locale="en">
      <CartProbe />
    </Providers>,
  );
  act(() => authEvent("INITIAL_SESSION", null));
  await waitFor(() => expect(current.ready).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  mocks.getUser.mockResolvedValue({ data: { user: { id: "A" } }, error: null });
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "A" } } },
    error: null,
  });
  await act(async () => {
    current.suspendCart();
    authEvent("SIGNED_IN", { user: { id: "A" } });
    await current.resumeCart();
  });
  expect(current.lines).toEqual([first]);
  expect(current.ready).toBe(true);
  expect(localStorage.getItem(guestCartKey)).toBeNull();
  expect(JSON.parse(localStorage.getItem(accountCartKey("A"))!).lines).toEqual([
    first,
  ]);
  expect(mocks.navigate).not.toHaveBeenCalled();
});
