import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
export default async function Page() {
  return (
    <Suspense>
      <AuthForm mode="sign-up" />
    </Suspense>
  );
}
