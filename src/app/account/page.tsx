import { requireUser, sessionContext } from "@/lib/auth";
import { Account } from "@/components/account";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ invitation?: string }>;
}) {
  const { invitation } = await searchParams;
  const next = invitation
    ? `/account?invitation=${encodeURIComponent(invitation)}`
    : "/account";
  const { db, user } = await requireUser(next);
  const [{ data: profile }, context] = await Promise.all([
    db.from("profiles").select("*").eq("user_id", user.id).single(),
    sessionContext(),
  ]);
  return (
    <Account
      name={profile?.display_name ?? ""}
      email={user.email ?? ""}
      invitation={invitation}
      privileged={!!context.platform || !!context.has_membership}
    />
  );
}
