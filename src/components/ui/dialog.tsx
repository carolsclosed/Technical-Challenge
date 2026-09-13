"use client";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogTitle = D.Title;
export const DialogDescription = D.Description;
export function DialogContent({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  return (
    <D.Portal>
      <D.Overlay className="overlay" />
      <D.Content className="dialog">
        {children}
        <D.Close className="dialog-close" aria-label={t("close")}>
          <X size={20} />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
