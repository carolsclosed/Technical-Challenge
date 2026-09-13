import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";
export const nameSchema = z.string().trim().min(2).max(120);
const phoneSchema = z.string().transform((v, ctx) => {
  const p = parsePhoneNumberFromString(v);
  if (!p?.isValid()) {
    ctx.addIssue({ code: "custom", message: "VALIDATION_ERROR" });
    return z.NEVER;
  }
  return p.number;
});
export const deliverySchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  country: z.enum(["PT", "US"]),
  street: z.string().trim().min(2).max(200),
  line2: z.string().trim().max(200),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  zip_code: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[\p{L}\p{N} -]+$/u),
  instructions: z.string().trim().max(500),
});
export type Delivery = z.infer<typeof deliverySchema>;
export const storeSchema = z.object({
  name: nameSchema,
  street: z.string().trim().min(2).max(200),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  zip_code: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[\p{L}\p{N} -]+$/u),
  phone: phoneSchema,
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }),
  active: z.boolean(),
});
export function parsePrice(v: string) {
  if (!/^\d{1,6}([.,]\d{1,2})?$/.test(v.trim()))
    throw Error("VALIDATION_ERROR");
  const [a, b = ""] = v.replace(",", ".").split(".");
  const cents = Number(a) * 100 + Number(b.padEnd(2, "0"));
  if (cents < 1 || cents > 99999999) throw Error("VALIDATION_ERROR");
  return cents;
}
export {
  money,
  nextStatus,
  safeNext,
} from "./display";
type Store = {
  id: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zip_code: string;
  phone: string;
  timezone: string;
  merchant_name: string;
  merchant_slug: string;
};
export type Product = {
  id: string;
  store_id: string;
  name: string;
  description: string;
  price_minor: number;
  available: boolean;
};
export type CartProduct = Product & {
  store_name: string;
  merchant_slug: string;
};
export type CartLine = { product_id: string; quantity: number };
export type Context = {
  platform: boolean;
  has_membership?: boolean;
  membership: null | {
    merchant_id: string;
    slug: string;
    name: string;
    status: string;
    role: "admin" | "staff" | "operator";
  };
};
export type Catalog = { stores: Store[]; products: Product[] };
export function errorCode(message: string) {
  return (
    [
      "INVITATION_ACCOUNT_IN_USE",
      "INVITATION_ALREADY_MEMBER",
      "INVITATION_EMAIL_MISMATCH",
      "INVITATION_INVALID",
      "INVITATION_UNAVAILABLE",
      "FORBIDDEN",
      "NOT_FOUND",
      "CONFLICT",
      "LAST_ADMIN_REQUIRED",
      "VALIDATION_ERROR",
      "CART_CHANGED",
      "RATE_LIMITED",
    ].find((x) => message.includes(x)) ?? "REQUEST_FAILED"
  );
}
