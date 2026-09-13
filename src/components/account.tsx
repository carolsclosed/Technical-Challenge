"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useApp } from "./providers";
import { Button } from "./ui/button";
import { SignOut } from "./header";
import { browserClient } from "@/lib/supabase/client";
import { mutate, readInvitation } from "@/app/actions/business";
import { navigateAfterAuth } from "@/lib/auth-navigation";

function TeamInvitation({
  token,
  dismiss,
}: {
  token: string;
  dismiss: () => void;
}) {
  const t = useTranslations();
  const { locale } = useApp();
  const router = useRouter();
  const [details, setDetails] = useState<
    | Extract<Awaited<ReturnType<typeof readInvitation>>, { ok: true }>["data"]
    | null
  >(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [accepted, setAccepted] = useState<{
    slug: string;
    secureSession: boolean;
  } | null>(null);

  useEffect(() => {
    let stopped = false;
    setLoading(true);
    setError("");
    void readInvitation(token)
      .then((result) => {
        if (stopped) return;
        if (result.ok) setDetails(result.data);
        else setError(result.error);
      })
      .catch(() => {
        if (!stopped) setError("REQUEST_FAILED");
      })
      .finally(() => {
        if (!stopped) setLoading(false);
      });
    return () => {
      stopped = true;
    };
  }, [token, attempt]);

  async function accept() {
    if (busy) return;
    setBusy(true);
    try {
      const db = browserClient();
      const {
        data: { user },
        error: identityError,
      } = await db.auth.getUser();
      if (identityError || !user) {
        navigateAfterAuth("/auth/sign-in?next=%2Faccount");
        return;
      }
      const result = await mutate("acceptInvitation", { token });
      if (!result.ok) {
        setError(result.error!);
        return;
      }
      sessionStorage.removeItem("mesa-invitation");
      // Acceptance never initiates MFA. Only choose the appropriate workspace
      // link; a new employee's AAL1 session cannot access workplace records.
      let secureSession = false;
      try {
        const { data, error } =
          await db.auth.mfa.getAuthenticatorAssuranceLevel();
        secureSession = !error && data?.currentLevel === "aal2";
      } catch {
        // The invitation was accepted. A failed assurance lookup must not
        // turn that committed result into an error or a second acceptance.
      }
      setAccepted({ slug: String(result.data), secureSession });
      router.refresh();
    } catch {
      setError("REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }

  if (accepted)
    return (
      <section className="invitation-panel stack" role="status">
        <div>
          <span className="eyebrow">{t("invitationAccepted")}</span>
          <h2>
            {t("invitationJoined", { merchant: details?.merchant_name ?? "" })}
          </h2>
        </div>
        <p>
          {t(
            accepted.secureSession
              ? "invitationReady"
              : "invitationSecureSignIn",
          )}
        </p>
        <div className="actions">
          <Button asChild>
            <Link
              href={
                accepted.secureSession
                  ? `/${accepted.slug}/dashboard`
                  : `/auth/sign-in?next=${encodeURIComponent(`/${accepted.slug}/dashboard`)}`
              }
            >
              {t(accepted.secureSession ? "workspace" : "signInWorkspace")}
            </Link>
          </Button>
          <Button variant="ghost" onClick={dismiss}>
            {t("close")}
          </Button>
        </div>
      </section>
    );

  const blocked = error.startsWith("INVITATION_");
  return (
    <section className="invitation-panel stack" aria-busy={loading || busy}>
      <div>
        <span className="eyebrow">{t("invitation")}</span>
        <h2>
          {details
            ? t("invitationWelcome", { merchant: details.merchant_name })
            : t("invitation")}
        </h2>
      </div>
      {details && (
        <dl className="invitation-details">
          <div>
            <dt>{t("role")}</dt>
            <dd>{t(details.role)}</dd>
          </div>
          <div>
            <dt>{t("invitationStores")}</dt>
            <dd>
              {details.store_names.length
                ? details.store_names.join(", ")
                : t(
                    details.role === "admin"
                      ? "adminAllStores"
                      : "noAssignedStores",
                  )}
            </dd>
          </div>
          <div>
            <dt>{t("expires")}</dt>
            <dd>{new Date(details.expires_at).toLocaleDateString(locale)}</dd>
          </div>
        </dl>
      )}
      {!blocked && <p>{t("invitationContinue")}</p>}
      {error && (
        <p className="notice error" role="alert">
          {t(error)}
        </p>
      )}
      <div className="actions">
        {!blocked && (
          <Button
            disabled={loading || busy || error === "REQUEST_FAILED"}
            onClick={() => void accept()}
          >
            {t(loading || busy ? "loading" : "acceptInvitation")}
          </Button>
        )}
        {error === "REQUEST_FAILED" && (
          <Button
            variant="outline"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {t("retry")}
          </Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={dismiss}>
          {t("invitationDismiss")}
        </Button>
      </div>
    </section>
  );
}

export function Account({
  name,
  email,
  invitation,
  privileged,
}: {
  name: string;
  email: string;
  invitation?: string;
  privileged: boolean;
}) {
  const t = useTranslations();
  const { locale } = useApp();
  const { theme } = useTheme();
  const [factor, setFactor] = useState("");
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invitationToken, setInvitationToken] = useState(invitation ?? "");

  useEffect(() => {
    setHydrated(true);
    void browserClient()
      .auth.mfa.listFactors()
      .then(({ data }) =>
        setFactor(
          data?.totp.find((factor) => factor.status === "verified")?.id ?? "",
        ),
      );
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const token =
      hash.get("invitation") ??
      invitation ??
      sessionStorage.getItem("mesa-invitation");
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      sessionStorage.setItem("mesa-invitation", token);
      setInvitationToken(token);
      if (hash.has("invitation"))
        window.history.replaceState(null, "", window.location.pathname);
    }
  }, [invitation]);

  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <h1>{t("account")}</h1>
      <p>{email}</p>
      {invitationToken && (
        <TeamInvitation
          key={invitationToken}
          token={invitationToken}
          dismiss={() => {
            sessionStorage.removeItem("mesa-invitation");
            setInvitationToken("");
          }}
        />
      )}
      <form
        className="card card-body stack"
        aria-busy={!hydrated || saving}
        onSubmit={async (event) => {
          event.preventDefault();
          if (!hydrated || saving) return;
          const values = {
            name: new FormData(event.currentTarget).get("name"),
            locale,
            theme: theme ?? "system",
          };
          setSaving(true);
          setMessage("");
          try {
            const result = await mutate("profile", values);
            setMessage(result.ok ? "saved" : result.error!);
          } catch {
            setMessage("REQUEST_FAILED");
          } finally {
            setSaving(false);
          }
        }}
      >
        <label htmlFor="name">{t("name")}</label>
        <input
          name="name"
          id="name"
          defaultValue={name}
          maxLength={120}
          disabled={!hydrated || saving}
        />
        <Button disabled={!hydrated || saving}>
          {t(saving ? "loading" : "save")}
        </Button>
      </form>
      <section className="card card-body stack" style={{ marginTop: 24 }}>
        <h2>{t("security")}</h2>
        <p>{t(factor ? "mfaEnabled" : "mfaOptional")}</p>
        {!factor && (
          <Button asChild>
            <Link href="/auth/mfa?next=/account&enroll=1">
              {t("enableMfa")}
            </Link>
          </Button>
        )}
        {factor && !privileged && (
          <form
            className="stack"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              try {
                const db = browserClient();
                const { error } = await db.auth.mfa.challengeAndVerify({
                  factorId: factor,
                  code,
                });
                if (error) {
                  setMessage("authError");
                  return;
                }
                const result = await db.auth.mfa.unenroll({ factorId: factor });
                setMessage(result.error ? "REQUEST_FAILED" : "saved");
                if (!result.error) {
                  setFactor("");
                  await db.auth.refreshSession();
                }
              } catch {
                setMessage("REQUEST_FAILED");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label htmlFor="remove-code">{t("code")}</label>
            <input
              id="remove-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
            <Button variant="outline" disabled={busy}>
              {t(busy ? "loading" : "disableMfa")}
            </Button>
          </form>
        )}
        <Link href="/auth/forgot-password">{t("reset")}</Link>
        <SignOut />
      </section>
      {message && (
        <div role="status" className="notice">
          {t(message)}
        </div>
      )}
    </div>
  );
}
