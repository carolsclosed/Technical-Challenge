"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ShoppingBag, Utensils, Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useApp } from "./providers";
import { Button } from "./ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from "./ui/dialog";
import type { Context } from "@/lib/domain";
import { browserClient } from "@/lib/supabase/client";
import { navigateAfterAuth } from "@/lib/auth-navigation";
const subscribeHydration = () => () => {};
const clientHydration = () => true;
const serverHydration = () => false;
export function Header({
  email,
  context,
}: {
  email?: string;
  context?: Context;
}) {
  const t = useTranslations();
  const { lines, locale, setLocale } = useApp();
  const { theme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    clientHydration,
    serverHydration,
  );
  const cartCount = hydrated
    ? lines.reduce((total, line) => total + line.quantity, 0)
    : 0;
  const links = (
    <>
      <Link href="/">{t("explore")}</Link>
      {email && <Link href="/orders">{t("orders")}</Link>}
      {context?.membership && (
        <Link href={`/${context.membership.slug}/dashboard`}>
          {t(context.membership.role === "admin" ? "dashboard" : "workspace")}
        </Link>
      )}
      {context?.platform && <Link href="/platform">{t("platform")}</Link>}
      <Link href={email ? "/account" : "/auth/sign-in"}>
        {t(email ? "account" : "signIn")}
      </Link>
    </>
  );
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Utensils size={21} />
          </span>
          mesa<span className="brand-dot">.</span>
        </Link>
        <nav className="desktop-nav">{links}</nav>
        <div className="header-tools">
          <select
            aria-label={t("language")}
            value={locale}
            onChange={(e) => setLocale(e.target.value as "en" | "pt-PT")}
          >
            <option value="en">EN</option>
            <option value="pt-PT">PT</option>
          </select>
          <select
            aria-label={t("theme")}
            value={hydrated ? (theme ?? "system") : "system"}
            onChange={(e) => setTheme(e.target.value)}
          >
            <option value="system">◐</option>
            <option value="light">☀</option>
            <option value="dark">☾</option>
          </select>
          <Button asChild size="sm">
            <Link href="/cart" aria-label={`${t("cart")} ${cartCount}`}>
              <ShoppingBag size={17} />
              <span className="cart-label">{t("cart")}</span>
              <span className="counter">{cartCount}</span>
            </Link>
          </Button>
          <div className="mobile-nav">
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={
                    locale === "pt-PT" ? "Menu de navegação" : "Navigation menu"
                  }
                >
                  <Menu />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>mesa.</DialogTitle>
                <nav className="stack">{links}</nav>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </header>
  );
}
export function SignOut() {
  const t = useTranslations();
  const { suspendCart, resumeCart } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        disabled={busy}
        aria-busy={busy}
        onClick={async () => {
          setBusy(true);
          setError(false);
          suspendCart();
          try {
            const { error } = await browserClient().auth.signOut();
            if (error) throw error;
            sessionStorage.removeItem("mesa-invitation");
            await resumeCart();
            navigateAfterAuth("/");
          } catch {
            await resumeCart().catch(() => {});
            setError(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t(busy ? "loading" : "signOut")}
      </Button>
      {error && <p role="alert">{t("REQUEST_FAILED")}</p>}
    </>
  );
}
