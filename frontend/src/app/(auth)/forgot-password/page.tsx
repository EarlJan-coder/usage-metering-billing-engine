import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthFormFallback } from "../auth-fallback";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot Password" };

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<AuthFormFallback />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
