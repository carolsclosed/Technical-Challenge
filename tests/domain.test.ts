import { describe, it, expect } from "vitest";
import {
  parsePrice,
  deliverySchema,
  safeNext,
  nextStatus,
} from "../src/lib/domain";
import { messages } from "../src/lib/messages";
describe("Currency and validation", () => {
  it("parses cents without floating-point multiplication", () => {
    expect(parsePrice("11.90")).toBe(1190);
    expect(parsePrice("11,9")).toBe(1190);
    expect(parsePrice("0.01")).toBe(1);
    for (const s of ["0", "-1", "1.999", "1e3", "1,000.00", "1000000"])
      expect(() => parsePrice(s)).toThrow();
  });
  it("rejects missing address data", () => {
    expect(deliverySchema.safeParse({ name: "Customer" }).success).toBe(false);
  });
  it("allows only same-origin relative redirects", () => {
    expect(safeNext("//evil.test")).toBe("/");
    expect(safeNext("/\\evil.test")).toBe("/");
    expect(safeNext("https://evil.test")).toBe("/");
    expect(safeNext("/orders")).toBe("/orders");
  });
  it("has no transition from terminal states", () => {
    expect(nextStatus.delivered).toBeUndefined();
    expect(nextStatus.cancelled).toBeUndefined();
    expect(nextStatus.rejected).toBeUndefined();
  });
  it("keeps every translation key in sync", () => {
    expect(Object.keys(messages.en).sort()).toEqual(
      Object.keys(messages["pt-PT"]).sort(),
    );
  });
});
