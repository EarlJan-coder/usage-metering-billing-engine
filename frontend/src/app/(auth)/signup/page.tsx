import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthFormFallback } from "../auth-fallback";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create Account" };

export default function SignupPage() {
  return (
    <Suspense fallback={<AuthFormFallback />}>
      <SignupForm />
    </Suspense>
  );
}
