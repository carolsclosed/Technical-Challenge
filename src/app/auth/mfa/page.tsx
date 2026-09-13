import { Suspense } from "react";
import { Mfa } from "@/components/auth-form";
export default function Page() {
  return (
    <Suspense>
      <Mfa />
    </Suspense>
  );
}
