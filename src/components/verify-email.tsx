"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { EmailOtpType } from "@supabase/supabase-js";
import { browserClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/display";
import { Button } from "./ui/button";
import { useApp } from "./providers";
import { navigateAfterAuth, signInDestination } from "@/lib/auth-navigation";
import { readInvitation } from "@/app/actions/business";

export function VerifyEmail() {
  const t = useTranslations();
  const { suspendCart, resumeCart } = useApp();
  const [link, setLink] = useState<{
    hash: string;
    type: EmailOtpType;
    next: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const hash = params.get("token_hash");
    const type = params.get("type");
    if (
      !hash ||
      !type ||
      !["signup", "invite", "magiclink", "recovery", "email_change"].includes(
        type,
      )
    ) {
      setError("emailLinkInvalid");
      return;
    }
    setLink({
      hash,
      type: type as EmailOtpType,
      next:
        type === "recovery"
          ? "/auth/reset-password"
          : safeNext(params.get("next")),
    });
  }, []);

  async function verify() {
    if (!link || busy) return;
    setBusy(true);
    setError("");
    suspendCart();
    let next: string | null = null;
    try {
      const db = browserClient();
      const destination = new URL(link.next, window.location.origin);
      const invitation = new URLSearchParams(destination.hash.slice(1)).get(
        "invitation",
      );
      if (
        destination.pathname === "/account" &&
        invitation &&
        /^[a-f0-9]{64}$/.test(invitation)
      ) {
        const {
          data: { user },
        } = await db.auth.getUser();
        if (user) {
          // Reusing an invitation link must not replace an existing session
          // with a fresh AAL1 magic-link session and ask for MFA again. The
          // database confirms the invitation matches this verified account.
          const details = await readInvitation(invitation);
          if (!details.ok) {
            setError(details.error);
            return;
          }
          sessionStorage.setItem("mesa-invitation", invitation);
          window.history.replaceState(null, "", window.location.pathname);
          next = "/account";
          return;
        }
        sessionStorage.setItem("mesa-invitation", invitation);
        destination.hash = "";
      }
      const { error: verificationError } = await db.auth.verifyOtp({
        token_hash: link.hash,
        type: link.type,
      });
      if (verificationError) {
        setError("emailLinkInvalid");
        return;
      }
      window.history.replaceState(null, "", window.location.pathname);
      next = await signInDestination(
        db.auth.mfa,
        destination.pathname + destination.search + destination.hash,
      );
    } catch {
      setError("REQUEST_FAILED");
    } finally {
      try {
        await resumeCart();
      } catch {
        next = null;
        setError("REQUEST_FAILED");
      }
      setBusy(false);
      if (next) navigateAfterAuth(next);
    }
  }

  return (
    <section className="card form-shell stack">
      <h1>{t("verifyEmail")}</h1>
      <p>{t("verifyEmailInfo")}</p>
      {error && (
        <p className="notice error" role="alert">
          {t(error)}
        </p>
      )}
      <Button onClick={() => void verify()} disabled={!link || busy}>
        {t(busy ? "loading" : "verify")}
      </Button>
    </section>
  );
}
