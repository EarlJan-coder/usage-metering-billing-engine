import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthFormFallback } from "../auth-fallback";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign In" };

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthFormFallback />}>
      <LoginForm />
    </Suspense>
  );
}
