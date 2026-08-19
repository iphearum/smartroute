"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../store/auth-store";

/**
 * UX-only gate: hides protected page content and redirects logged-out
 * visitors, so navigation doesn't flash sensitive-looking UI before the
 * session bootstrap resolves. This is NOT a security boundary -- every
 * backend endpoint that reads/writes user-owned data must independently
 * verify the session cookie server-side (see api/auth.py's `me` endpoint
 * for the pattern), since the client bundle and any client-only state are
 * always inspectable by the visitor.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status),
    router = useRouter();
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);
  if (status === "idle" || status === "loading")
    return (
      <div className="grid min-h-[60vh] place-items-center text-sm text-slate-500">
        Loading…
      </div>
    );
  if (status !== "authenticated") return null;
  return <>{children}</>;
}
