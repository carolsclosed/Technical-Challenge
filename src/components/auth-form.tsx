"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/display";
import { Button } from "./ui/button";
import { useApp } from "./providers";
import { navigateAfterAuth, signInDestination } from "@/lib/auth-navigation";

export function AuthForm({
  mode,
}: {
  mode: "sign-in" | "sign-up" | "forgot-password" | "reset-password";
}) {
  const t = useTranslations();
  const { locale, suspendCart, resumeCart } = useApp();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const title =
    mode === "sign-in" ? "signIn" : mode === "sign-up" ? "signUp" : "reset";

  return (
    <div className="card form-shell">
      <div className="eyebrow">mesa.</div>
      <h1>{t(title)}</h1>
      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          setSuccess(false);

          const fields = new FormData(event.currentTarget);
          const email = String(fields.get("email") ?? "");
          const password = String(fields.get("password") ?? "");
          const db = browserClient();
          const site =
            process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
          let authError: unknown = null;
          let destination = mode === "reset-password" ? "/account" : next;
          // With email confirmations enabled, sign-up creates an unverified
          // account but does not establish a browser session. Suspending and
          // resolving the cart here could turn a successful registration into
          // a visible failure if the unrelated identity refresh failed after
          // Supabase had already created the account and sent its email.
          const changesIdentity = mode === "sign-in";
          if (changesIdentity) suspendCart();

          try {
            if (mode === "sign-in") {
              authError = (
                await db.auth.signInWithPassword({ email, password })
              ).error;
              if (!authError)
                destination = await signInDestination(db.auth.mfa, next);
            } else if (mode === "sign-up") {
              authError = (
                await db.auth.signUp({
                  email,
                  password,
                  options: {
                    emailRedirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}`,
                    data: { locale },
                  },
                })
              ).error;
            } else if (mode === "forgot-password") {
              authError = (
                await db.auth.resetPasswordForEmail(email, {
                  redirectTo: `${site}/auth/callback?next=/auth/reset-password`,
                })
              ).error;
            } else {
              authError = (await db.auth.updateUser({ password })).error;
            }
          } catch {
            authError = new Error("authError");
          } finally {
            if (changesIdentity) {
              try {
                await resumeCart();
              } catch {
                authError = new Error("authError");
              }
            }
            setBusy(false);
          }

          // Recovery must not disclose whether an address exists. Delivery and
          // rate-limit failures use the same user-facing response.
          if (mode === "forgot-password") {
            setSuccess(true);
            return;
          }

          if (authError) {
            setError(mode === "sign-up" ? "signUpError" : "authError");
            return;
          }

          if (mode === "sign-in" || mode === "reset-password") {
            navigateAfterAuth(destination);
          } else {
            setSuccess(true);
          }
        }}
      >
        {mode !== "reset-password" && (
          <div>
            <label htmlFor="email">{t("email")}</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
            />
          </div>
        )}
        {mode !== "forgot-password" && (
          <div>
            <label htmlFor="password">{t("password")}</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={mode === "sign-in" ? 1 : 12}
              autoComplete={
                mode === "sign-in" ? "current-password" : "new-password"
              }
            />
            {mode !== "sign-in" && <small>{t("passwordHelp")}</small>}
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            {t(error)}
          </div>
        )}
        {success && (
          <div className="notice" role="status">
            {t("checkEmail")}
          </div>
        )}
        <Button disabled={busy}>
          {t(
            busy ? "loading" : mode === "forgot-password" ? "sendReset" : title,
          )}
        </Button>
        {mode === "sign-in" && (
          <>
            <Link href={`/auth/sign-up?next=${encodeURIComponent(next)}`}>
              {t("signUp")} →
            </Link>
            <Link className="muted" href="/auth/forgot-password">
              {t("forgot")}
            </Link>
          </>
        )}
      </form>
    </div>
  );
}

export function Mfa() {
  const t = useTranslations();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const enroll = params.get("enroll") === "1";
  const [factor, setFactor] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stopped = false;

    async function setup() {
      try {
        const db = browserClient();
        const {
          data: { user },
          error: userError,
        } = await db.auth.getUser();
        if (stopped) return;
        if (userError || !user) {
          navigateAfterAuth(
            `/auth/sign-in?next=${encodeURIComponent(`/auth/mfa?next=${encodeURIComponent(next)}`)}`,
          );
          return;
        }

        const { data: aal, error: aalError } =
          await db.auth.mfa.getAuthenticatorAssuranceLevel();
        if (stopped) return;
        if (aalError) {
          setError("REQUEST_FAILED");
          return;
        }
        if (aal?.currentLevel === "aal2" && !enroll) {
          navigateAfterAuth(next);
          return;
        }

        const { data: factors, error: factorsError } =
          await db.auth.mfa.listFactors();
        if (stopped) return;
        if (factorsError || !factors) {
          setError("REQUEST_FAILED");
          return;
        }

        const verified = factors.totp.find(
          (candidate) => candidate.status === "verified",
        );
        if (verified) {
          setFactor(verified.id);
          return;
        }

        // Supabase only includes verified TOTP factors in `totp`; pending
        // enrollment factors are exposed through `all` and must be removed
        // before creating the friendly name used by this application.
        const pending = factors.all.filter(
          (candidate) => candidate.status === "unverified",
        );
        for (const candidate of pending) {
          if (stopped) return;
          const { error: unenrollError } = await db.auth.mfa.unenroll({
            factorId: candidate.id,
          });
          if (unenrollError && unenrollError.code !== "mfa_factor_not_found") {
            if (!stopped) setError("REQUEST_FAILED");
            return;
          }
        }
        if (stopped) return;

        const { data, error: enrollError } = await db.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "mesa authenticator",
        });
        if (stopped) return;
        if (enrollError || !data) {
          setError("REQUEST_FAILED");
          return;
        }
        setFactor(data.id);
        // Auth-js prefixes the SVG with a data URI. Trimming is required for
        // local Supabase responses that contain a trailing newline, which
        // next/image rejects as an invalid source.
        setQr(data.totp.qr_code.trim());
      } catch {
        if (!stopped) setError("REQUEST_FAILED");
      }
    }

    void setup();
    return () => {
      stopped = true;
    };
  }, [enroll, next]);

  return (
    <div className="card form-shell">
      <h1>{t("mfaTitle")}</h1>
      {!qr && <p>{t("mfaChallenge")}</p>}
      {qr && (
        <>
          <p>{t("mfaInfo")}</p>
          <Image
            unoptimized
            src={qr}
            width={240}
            height={240}
            alt={t("mfaTitle")}
          />
        </>
      )}
      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!factor) return;
          setBusy(true);
          setError("");
          try {
            const db = browserClient();
            const { error: verifyError } = await db.auth.mfa.challengeAndVerify(
              {
                factorId: factor,
                code,
              },
            );
            if (verifyError) {
              setError("authError");
              return;
            }
            navigateAfterAuth(next);
          } catch {
            setError("authError");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="code">{t("code")}</label>
        <input
          id="code"
          disabled={!factor || busy}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          autoComplete="one-time-code"
          required
        />
        {error && (
          <div className="notice error" role="alert">
            {t(error)}
          </div>
        )}
        <Button disabled={!factor || busy}>
          {t(busy ? "loading" : "verify")}
        </Button>
      </form>
    </div>
  );
}

export function Complete() {
  const t = useTranslations();
  const { suspendCart, resumeCart } = useApp();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const started = useRef(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    // React Strict Mode runs effects twice in development. Hash tokens are
    // consumed on the first run, so a second run would otherwise report a
    // false error after the URL has been cleaned up.
    if (started.current) return;
    started.current = true;

    async function finish() {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
      if (!accessToken || !refreshToken) {
        setError(true);
        return;
      }

      suspendCart();
      try {
        const db = browserClient();
        const { error: sessionError } = await db.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) throw sessionError;
        const destination = await signInDestination(db.auth.mfa, next);
        await resumeCart();
        navigateAfterAuth(destination);
      } catch {
        await resumeCart().catch(() => {});
        setError(true);
      }
    }

    void finish();
  }, [next, suspendCart, resumeCart]);

  return (
    <div className="container">
      <p role="status">{t(error ? "authError" : "loading")}</p>
    </div>
  );
}
