import { beforeEach, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/auth";

const { getUser, getClaims } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getClaims: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  serverClient: async () => ({ auth: { getUser, getClaims } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw Error(`REDIRECT:${path}`);
  },
  notFound: vi.fn(),
}));
beforeEach(() => {
  getUser.mockResolvedValue({
    data: { user: { id: "A", factors: [{ status: "verified" }] } },
  });
  getClaims.mockResolvedValue({ data: { claims: { sub: "A", aal: "aal2" } } });
});

it("reuses AAL2 across ordinary and privileged routes without another challenge", async () => {
  for (const route of ["/account", "/orders", "/checkout"])
    expect((await requireUser(route)).user.id).toBe("A");
  expect((await requireUser("/merchant/dashboard", true)).user.id).toBe("A");
});

it("does not initiate routine page challenges but denies AAL1 privileged access", async () => {
  getClaims.mockResolvedValue({ data: { claims: { sub: "A", aal: "aal1" } } });
  expect((await requireUser("/account")).user.id).toBe("A");
  await expect(requireUser("/merchant/dashboard", true)).rejects.toThrow(
    "REDIRECT:/auth/mfa?next=%2Fmerchant%2Fdashboard",
  );
});

it("cannot use an AAL2 claim belonging to a different user", async () => {
  getClaims.mockResolvedValue({ data: { claims: { sub: "B", aal: "aal2" } } });
  await expect(requireUser("/platform", true)).rejects.toThrow(
    "REDIRECT:/auth/mfa",
  );
});
