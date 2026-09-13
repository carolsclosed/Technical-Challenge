// Keep display helpers independent of form validation so browsing does not
// compile/download Zod and the phone-number metadata used by checkout.
export function money(cents: number, locale = "en") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

export type Status =
  | "placed"
  | "accepted"
  | "preparing"
  | "out_for_delivery"
  | "delivered"
  | "rejected"
  | "cancelled";
export const nextStatus: Partial<Record<Status, Status>> = {
  placed: "accepted",
  accepted: "preparing",
  preparing: "out_for_delivery",
  out_for_delivery: "delivered",
};
export const terminal = (status: string) =>
  ["delivered", "rejected", "cancelled"].includes(status);

export function safeNext(value: string | null) {
  return value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/[\r\n]/.test(value)
    ? value
    : "/";
}
