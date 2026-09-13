"use client";

import { useTranslations } from "next-intl";

type ShellMessage = "footerTagline" | "partner" | "setupInfo";

export function ShellCopy({ message }: { message: ShellMessage }) {
  const t = useTranslations();
  return t(message);
}
