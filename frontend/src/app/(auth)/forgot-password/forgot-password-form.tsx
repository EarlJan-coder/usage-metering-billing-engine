"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { CheckCircle2, Loader2 } from "lucide-react";

import { ApiError } from "@/lib/api/client";
import { authApi } from "@/lib/api/auth";
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from "@/lib/validations/auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordValues) {
    setFormError(null);
    try {
      await authApi.forgotPassword(values);
      setSentTo(values.email);
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 404 || error.status === 501)
      ) {
        setFormError(
          "Password reset is not available on this deployment yet — the backend does not expose /auth/forgot-password. Contact your workspace administrator.",
        );
      } else {
        setFormError(
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Please try again.",
        );
      }
    }
  }

  if (sentTo) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center shadow-sm">
        <CheckCircle2
          className="mx-auto size-9 text-success"
          aria-hidden="true"
        />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">
          Check your inbox
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          If an account exists for{" "}
          <span className="font-medium text-foreground">{sentTo}</span>,
          password reset instructions are on the way.
        </p>
        <Button variant="outline" className="mt-6 w-full" asChild>
          <Link href="/login">Back to Sign In</Link>
        </Button>
      </div>
    );
  }

  const submitting = form.formState.isSubmitting;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">
          Reset your password
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your account email and we will send reset instructions.
        </p>
      </div>

      {formError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Request failed</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="you@company.com"
                    autoComplete="email"
                    autoFocus
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Sending…
              </>
            ) : (
              "Send reset instructions"
            )}
          </Button>
        </form>
      </Form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign In
        </Link>
      </p>
    </div>
  );
}
