import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, it } from "vitest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { messages } from "@/lib/messages";

it.each([
  ["en", "Close"],
  ["pt-PT", "Fechar"],
] as const)("localizes the dialog close control for %s", (locale, closeLabel) => {
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>mesa.</DialogTitle>
          <DialogDescription>mesa.</DialogDescription>
        </DialogContent>
      </Dialog>
    </NextIntlClientProvider>,
  );

  expect(
    screen.getByRole("button", { name: closeLabel }).getAttribute("aria-label"),
  ).toBe(closeLabel);
});
