import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { requireUser } from "@/lib/auth";
export default async function Page() {
  await requireUser("/auth/reset-password");
  return (
    <Suspense>
      <AuthForm mode="reset-password" />
    </Suspense>
  );
}
