import type { SupabaseClient } from "@supabase/supabase-js";
import { safeNext } from "./display";

// Check once when a new session is established. The verified session's AAL2
// claim remains the authority for later server and database authorization.
export async function signInDestination(
  mfa: SupabaseClient["auth"]["mfa"],
  next: string,
) {
  const { data, error } = await mfa.getAuthenticatorAssuranceLevel();
  if (error || !data?.currentLevel) throw Error("authError");
  const destination = safeNext(next);
  return data.currentLevel !== "aal2" && data.nextLevel === "aal2"
    ? `/auth/mfa?next=${encodeURIComponent(destination)}`
    : destination;
}

export function navigateAfterAuth(destination: string) {
  // A fresh document discards prefetched RSC payloads and client state from
  // the old identity / assurance level, including checkout delivery fields.
  window.location.replace(safeNext(destination));
}
