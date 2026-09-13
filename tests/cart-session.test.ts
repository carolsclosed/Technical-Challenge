import { beforeEach, expect, it } from "vitest";
import {
  accountCartKey,
  CartSession,
  guestCartKey,
  normalizeCart,
} from "@/lib/cart-session";

const first = {
  product_id: "30000000-0000-4000-8000-000000000011",
  quantity: 2,
};
const second = {
  product_id: "30000000-0000-4000-8000-000000000031",
  quantity: 1,
};
const stored = (lines: unknown, id = "cart-id") =>
  JSON.stringify({ id, lines, transferred: [] });
const identify = (cart: CartSession, user: string | null, transfer = false) =>
  cart.resolve(cart.suspend(), user, transfer);
beforeEach(() => localStorage.clear());

it("starts empty until identity resolves and never imports the old ownerless cart", () => {
  localStorage.setItem("mesa-cart", JSON.stringify([first]));
  localStorage.setItem(accountCartKey("A"), stored([second]));
  const cart = new CartSession();
  cart.attach(localStorage);
  expect(cart.getSnapshot()).toMatchObject({ ready: false, lines: [] });
  expect(cart.update(cart.getSnapshot().epoch, [first])).toBe(false);
  expect(localStorage.getItem("mesa-cart")).toBeNull();
  identify(cart, "A");
  expect(cart.getSnapshot().lines).toEqual([second]);
});

it("isolates account A, account B, and guest carts across sign-out and reload", () => {
  const cart = new CartSession();
  cart.attach(localStorage);
  identify(cart, "A");
  cart.update(cart.getSnapshot().epoch, [first]);
  identify(cart, null);
  expect(cart.getSnapshot().lines).toEqual([]);
  identify(cart, "B", true);
  expect(cart.getSnapshot().lines).toEqual([]);
  cart.update(cart.getSnapshot().epoch, [second]);
  identify(cart, "A", true);
  expect(cart.getSnapshot().lines).toEqual([first]);
  const reloaded = new CartSession();
  reloaded.attach(localStorage);
  identify(reloaded, "B");
  expect(reloaded.getSnapshot().lines).toEqual([second]);
});

it("transfers only a guest cart once into the account that signs in", () => {
  const cart = new CartSession();
  cart.attach(localStorage);
  identify(cart, null);
  cart.update(cart.getSnapshot().epoch, [first]);
  localStorage.setItem(accountCartKey("A"), stored([second]));
  const guest = localStorage.getItem(guestCartKey)!;
  identify(cart, "A", true);
  expect(cart.getSnapshot().lines).toEqual([second, first]);
  expect(localStorage.getItem(guestCartKey)).toBeNull();
  // A repeated event or a failed guest-key removal cannot double quantities.
  identify(cart, null);
  localStorage.setItem(guestCartKey, guest);
  identify(cart, "A", true);
  expect(cart.getSnapshot().lines).toEqual([second, first]);
  identify(cart, "B", true);
  expect(cart.getSnapshot().lines).toEqual([]);
});

it("rejects late identity resolutions and cart updates from the previous account", () => {
  const cart = new CartSession();
  cart.attach(localStorage);
  identify(cart, "A");
  cart.update(cart.getSnapshot().epoch, [first]);
  const oldEpoch = cart.getSnapshot().epoch;
  const superseded = cart.suspend();
  expect(cart.getSnapshot()).toMatchObject({ ready: false, lines: [] });
  identify(cart, "B");
  cart.resolve(superseded, "A");
  expect(cart.update(oldEpoch, [first])).toBe(false);
  expect(cart.getSnapshot()).toMatchObject({
    scope: accountCartKey("B"),
    lines: [],
  });
});

it("persists only valid product IDs and bounded quantities, never delivery data", () => {
  const cart = new CartSession();
  cart.attach(localStorage);
  localStorage.setItem(
    guestCartKey,
    stored([
      {
        ...first,
        delivery: { name: "Private name", street: "Private street" },
      },
    ]),
  );
  identify(cart, null);
  cart.update(cart.getSnapshot().epoch, (lines) => lines);
  const record = localStorage.getItem(guestCartKey)!;
  expect(record).not.toContain("Private");
  expect(JSON.parse(record).lines).toEqual([first]);
  expect(
    normalizeCart([
      { ...first, quantity: 1000 },
      first,
      { ...second, quantity: -1 },
      { product_id: "invalid", quantity: 2 },
    ]),
  ).toEqual([{ ...first, quantity: 99 }]);
  localStorage.setItem(accountCartKey("B"), "{invalid");
  identify(cart, "B");
  expect(cart.getSnapshot().lines).toEqual([]);
});
