import "server-only";
import { cookies, headers } from "next/headers";

export type Locale = "en" | "pt-PT";

export async function getRequestLocale(): Promise<Locale> {
  const [jar, requestHeaders] = await Promise.all([cookies(), headers()]);
  const cookieLocale = jar.get("locale")?.value;

  return cookieLocale === "pt-PT" ||
    (!cookieLocale && requestHeaders.get("accept-language")?.startsWith("pt"))
    ? "pt-PT"
    : "en";
}
