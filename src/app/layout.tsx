import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import Link from "next/link";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";
import { ShellCopy } from "@/components/shell-copy";
import { sessionContext } from "@/lib/auth";
import { getRequestLocale } from "@/lib/locale";
import { messages } from "@/lib/messages";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const t = messages[locale];
  return {
    title: { default: t.metadataTitle, template: "%s · mesa." },
    description: t.metadataDescription,
  };
}

async function SessionHeader({ email }: { email?: string }) {
  const context = email ? await sessionContext() : undefined;
  return <Header email={email} context={context} />;
}

async function PartnerLink({
  email,
}: {
  email?: string;
}) {
  const context = email ? await sessionContext() : undefined;
  if (context?.platform || context?.has_membership || context?.membership)
    return null;
  return (
    <Link href="/merchant/apply">
      <ShellCopy message="partner" /> ↗
    </Link>
  );
}

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, requestHeaders] = await Promise.all([
    getRequestLocale(),
    headers(),
  ]);
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
              <ShellCopy message="footerTagline" />
            </span>
            <Suspense>
              <PartnerLink email={email} />
            </Suspense>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
