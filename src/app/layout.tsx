import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Suspense } from "react";
import Link from "next/link";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";
import { sessionContext } from "@/lib/auth";

export const metadata: Metadata = {
  title: { default: "mesa. · Local food, together", template: "%s · mesa." },
  description:
    "Discover local stores, order across kitchens, and follow each delivery. Cash on delivery.",
};

async function SessionHeader({ email }: { email?: string }) {
  const context = email ? await sessionContext() : undefined;
  return <Header email={email} context={context} />;
}

async function PartnerLink({
  email,
  locale,
}: {
  email?: string;
  locale: string;
}) {
  const context = email ? await sessionContext() : undefined;
  if (context?.platform || context?.has_membership || context?.membership)
    return null;
  return (
    <Link href="/merchant/apply">
      {locale === "en" ? "Become a partner" : "Tornar-se parceiro"} ↗
    </Link>
  );
}

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [jar, requestHeaders] = await Promise.all([cookies(), headers()]);
  const locale =
    jar.get("locale")?.value === "pt-PT" ||
    (!jar.get("locale") &&
      requestHeaders.get("accept-language")?.startsWith("pt"))
      ? "pt-PT"
      : "en";
  const email = requestHeaders.get("x-mesa-user-email") ?? undefined;
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <Providers locale={locale}>
          <Suspense fallback={<Header email={email} />}>
            <SessionHeader email={email} />
          </Suspense>
          <main>{children}</main>
          <footer>
            <span className="brand">mesa.</span>
            <span>
              {locale === "en"
                ? "Local kitchens. Together."
                : "Cozinhas locais. Juntas."}
            </span>
            <Suspense>
              <PartnerLink email={email} locale={locale} />
            </Suspense>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
