"use client";
import * as A from "@radix-ui/react-alert-dialog";
import { Button } from "./button";
import { useTranslations } from "next-intl";
export function Confirm({
  children,
  title,
  onConfirm,
}: {
  children: React.ReactNode;
  title: string;
  onConfirm: () => void;
}) {
  const t = useTranslations();
  return (
    <A.Root>
      <A.Trigger asChild>{children}</A.Trigger>
      <A.Portal>
        <A.Overlay className="overlay" />
        <A.Content className="dialog">
          <A.Title>{title}</A.Title>
          <A.Description>{t("confirmBody")}</A.Description>
          <div className="actions">
            <A.Cancel asChild>
              <Button variant="outline">{t("back")}</Button>
            </A.Cancel>
            <A.Action asChild>
              <Button variant="destructive" onClick={onConfirm}>
                {t("confirm")}
              </Button>
            </A.Action>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}
