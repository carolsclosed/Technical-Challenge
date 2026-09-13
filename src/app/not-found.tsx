"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
export default function NotFound() {
  const t = useTranslations();
  return (
    <div className="container empty">
      <h1>404</h1>
      <p>{t("noAccess")}</p>
      <Link href="/">{t("browse")} →</Link>
    </div>
  );
}
