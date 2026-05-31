"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";

/**
 * Email sign-in, CODE-ONLY (no magic link):
 *
 *   1. Enter email -> Supabase emails a one-time code (signInWithOtp).
 *   2. Type the code here -> verifyOtp({ type: "email" }) -> session.
 *
 * The Supabase email template deliberately renders ONLY `{{ .Token }}` (the
 * magic-link `{{ .ConfirmationURL }}` is omitted) — see
 * docs/supabase/auth-email-login-code.html. On success we navigate to
 * `?next=` (default /today).
 *
 * useSearchParams forces dynamic rendering, so the inner content is wrapped
 * in <Suspense> to satisfy Next.js's prerender constraints.
 */
export default function LoginPage() {
  return (
    <React.Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-[var(--color-surface)]">
          <div className="text-sm text-[var(--color-text-secondary)]">Loading…</div>
        </main>
      }
    >
      <LoginInner />
    </React.Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next") ?? "/today";
  const initialError = searchParams.get("error");

  const [stage, setStage] = React.useState<"email" | "code">("email");
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();

  // Show a toast if we landed here from a failed callback exchange.
  React.useEffect(() => {
    if (initialError === "auth") {
      toast({
        title: "Sign-in link couldn't complete",
        description:
          "Try entering the 6-digit code from the email instead, or request a new link.",
        variant: "destructive",
      });
    }
  }, [initialError, toast]);

  async function handleSendCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim() || pending) return;
    setPending(true);
    try {
      const supabase = createClient();
      // Code-only: no emailRedirectTo, so the email carries just the OTP code
      // (the template omits the magic link). User verifies by typing the code.
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
      });
      if (error) {
        console.error("signInWithOtp failed:", error);
        toast({
          title: "Couldn't send code",
          description: error.message,
          variant: "destructive",
        });
        return;
      }
      setStage("code");
    } catch (err) {
      toast({
        title: "Something went wrong",
        description: err instanceof Error ? err.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = code.replace(/\s+/g, "").trim();
    if (trimmed.length < 6 || pending) return;
    setPending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: trimmed,
        type: "email",
      });
      if (error) {
        toast({
          title: "Code didn't verify",
          description: error.message,
          variant: "destructive",
        });
        return;
      }
      router.push(nextParam);
      router.refresh();
    } catch (err) {
      toast({
        title: "Something went wrong",
        description: err instanceof Error ? err.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-[var(--color-surface)]">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <header className="flex flex-col items-center gap-2 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[var(--color-surface-muted)] flex items-center justify-center">
            <Mail className="w-7 h-7 text-[var(--color-text-primary)]" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {stage === "code" ? "Enter your code" : "Sign in"}
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {stage === "code"
              ? `Check ${email} for your sign-in code.`
              : "We'll email you a one-time sign-in code."}
          </p>
        </header>

        {stage === "code" ? (
          <form onSubmit={handleVerifyCode} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code">Sign-in code</Label>
              <Input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6,10}"
                maxLength={10}
                placeholder="Enter code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                disabled={pending}
                className="text-center tracking-[0.3em] text-xl font-semibold"
                autoFocus
              />
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={pending || code.replace(/\s+/g, "").length < 6}
            >
              {pending ? "Verifying…" : "Sign in"}
              {!pending && <ArrowRight className="w-4 h-4" />}
            </Button>
            <button
              type="button"
              onClick={() => {
                setStage("email");
                setCode("");
              }}
              className="text-sm text-[var(--color-accent-blue)] font-medium"
            >
              Use a different email
            </button>
          </form>
        ) : (
          <form onSubmit={handleSendCode} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={pending}
              />
            </div>
            <Button type="submit" size="lg" disabled={pending || !email.trim()}>
              {pending ? "Sending…" : "Send code"}
              {!pending && <ArrowRight className="w-4 h-4" />}
            </Button>
          </form>
        )}

        <div className="text-center text-sm text-[var(--color-text-secondary)]">
          Don&apos;t have an account?{" "}
          <Link
            href="/onboarding"
            className="text-[var(--color-accent-blue)] font-medium"
          >
            Get started
          </Link>
        </div>
      </div>
    </main>
  );
}
