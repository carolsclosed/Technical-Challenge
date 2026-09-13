import { requireUser, sessionContext } from "@/lib/auth";
import { Application } from "@/components/platform";
export default async function Page() {
  const { db, user } = await requireUser("/merchant/status", true);
  const [{ data: status }, context] = await Promise.all([
    db
      .from("merchants")
      .select("id,name,slug,status,rejection_reason")
      .eq("applicant_id", user.id)
      .maybeSingle(),
    sessionContext(),
  ]);
  const m = context.membership;
  return (
    <Application
      status={
        (status ??
          (m
            ? { name: m.name, slug: m.slug, status: m.status }
            : undefined)) as
          | {
              name: string;
              slug: string;
              status: string;
              rejection_reason?: string | null;
            }
          | undefined
      }
    />
  );
}
