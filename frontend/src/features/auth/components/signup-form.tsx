"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LiquidCard } from "@/shared/ui/liquid";
import { useAuthStore } from "../store/auth-store";
import { useI18n } from "@/features/i18n/use-i18n";

export function SignupForm() {
  const [displayName, setDisplayName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [submitting, setSubmitting] = useState(false),
    signup = useAuthStore((s) => s.signup),
    error = useAuthStore((s) => s.error),
    router = useRouter();
  const t = useI18n();
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await signup({ email, password, displayName: displayName || undefined });
      router.push("/dashboard");
    } catch {
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <LiquidCard className="mx-auto mt-16 w-full max-w-sm rounded-[28px] p-6">
      <p className="text-[9px] font-extrabold uppercase tracking-widest text-emerald-700">
        Get started
      </p>
      <strong className="text-lg">
        {t("auth.createAccount", "Create your account")}
      </strong>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <input
          type="text"
          autoComplete="name"
          placeholder={t("auth.nameOptional", "Name (optional)")}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className="route-point-card h-11 rounded-[16px] border px-3 text-sm outline-none"
        />
        <input
          type="email"
          required
          autoComplete="email"
          placeholder={t("auth.email", "Email")}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="route-point-card h-11 rounded-[16px] border px-3 text-sm outline-none"
        />
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder={t("auth.passwordHint", "Password (min 8 characters)")}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="route-point-card h-11 rounded-[16px] border px-3 text-sm outline-none"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="h-11 rounded-[16px] bg-emerald-700 text-sm font-bold text-white disabled:opacity-50"
        >
          {submitting ? "Creating account…" : "Sign up"}
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-emerald-700">
          Log in
        </Link>
      </p>
    </LiquidCard>
  );
}
