"use client";

import { Suspense } from "react";
import { Complete } from "@/components/auth-form";

export default function Page() {
  return (
    <Suspense>
      <Complete />
    </Suspense>
  );
}
