import { requireUser, sessionContext } from "@/lib/auth";
import { Application } from "@/components/platform";
import { redirect } from "next/navigation";
export default async function Page() {
  await requireUser("/merchant/apply", true);
  const context = await sessionContext();
  if (context.platform) redirect("/platform");
  if (context.has_membership || context.membership)
    redirect("/merchant/status");
  return <Application />;
}
