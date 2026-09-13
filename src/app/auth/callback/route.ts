import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/display";
import { signInDestination } from "@/lib/auth-navigation";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  // Keep local previews and deployments usable when NEXT_PUBLIC_SITE_URL is
  // omitted. The configured URL still takes precedence in normal operation.
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;

  if (!code) {
    return NextResponse.redirect(
      new URL(`/auth/complete?next=${encodeURIComponent(next)}`, site),
    );
  }

  const db = await serverClient();
  const { error } = await db.auth.exchangeCodeForSession(code);
  if (!error) {
    try {
      return NextResponse.redirect(
        new URL(await signInDestination(db.auth.mfa, next), site),
      );
    } catch {
      /* Stay at sign-in if the session's assurance cannot be read. */
    }
  }

  return NextResponse.redirect(new URL("/auth/sign-in?error=authError", site));
}
