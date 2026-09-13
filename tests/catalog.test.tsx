import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProductCard } from "@/components/catalog";

const { readCartProducts, setLines } = vi.hoisted(() => ({
  readCartProducts: vi.fn(),
  setLines: vi.fn(),
}));
vi.mock("@/lib/catalog-data", () => ({ readCartProducts }));
vi.mock("@/components/providers", () => ({
  useApp: () => ({ lines: [], setLines, locale: "en", ready: true }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/",
}));

const product = {
  id: "product-1",
  store_id: "store-1",
  name: "House bowl",
  description: "",
  available: true,
  price_minor: 1190,
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  setLines.mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("locks rapid clicks until the stock check and acknowledgement complete", async () => {
  let resolve: (result: unknown) => void = () => {};
  readCartProducts.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render(<ProductCard product={product} />);
  const button = screen.getByRole("button", { name: "add" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(readCartProducts).toHaveBeenCalledTimes(1);
  expect(
    (screen.getByRole("button", { name: "adding" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(setLines).not.toHaveBeenCalled();
  await act(async () => {
    resolve({ data: [product], error: null });
  });
  expect(setLines).toHaveBeenCalledTimes(1);
  expect(
    (screen.getByRole("button", { name: "added" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "added" }));
  expect(setLines).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(900));
  expect(
    (screen.getByRole("button", { name: "add" }) as HTMLButtonElement).disabled,
  ).toBe(false);
});

it("visibly labels unavailable products and never attempts an add", () => {
  render(<ProductCard product={{ ...product, available: false }} />);
  const button = screen.getByRole("button", { name: "outOfStock" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(button);
  expect(screen.getAllByText("outOfStock").length).toBe(2);
  expect(readCartProducts).not.toHaveBeenCalled();
});

it("does not add a product that went out of stock after the page loaded", async () => {
  readCartProducts.mockResolvedValue({
    data: [{ ...product, available: false }],
    error: null,
  });
  render(<ProductCard product={product} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "add" }));
  });
  expect(setLines).not.toHaveBeenCalled();
  expect(
    (screen.getByRole("button", { name: "outOfStock" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
