import { create } from "zustand";
import { authApi } from "../api/auth-api";
import type { AuthUser, LoginPayload, SignupPayload } from "../domain/types";
import { ApiError } from "@/shared/api/http";

type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
  bootstrap: () => Promise<void>;
  login: (payload: LoginPayload) => Promise<void>;
  signup: (payload: SignupPayload) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: "idle",
  error: null,
  bootstrap: async () => {
    if (get().status !== "idle") return;
    set({ status: "loading" });
    try {
      const user = await authApi.me();
      set({ user, status: user ? "authenticated" : "unauthenticated" });
    } catch {
      set({ status: "unauthenticated" });
    }
  },
  login: async (payload) => {
    set({ error: null });
    try {
      const user = await authApi.login(payload);
      set({ user, status: "authenticated" });
    } catch (error) {
      set({
        error: error instanceof ApiError ? error.message : "Login failed",
      });
      throw error;
    }
  },
  signup: async (payload) => {
    set({ error: null });
    try {
      const user = await authApi.signup(payload);
      set({ user, status: "authenticated" });
    } catch (error) {
      set({
        error: error instanceof ApiError ? error.message : "Sign up failed",
      });
      throw error;
    }
  },
  logout: async () => {
    try {
      await authApi.logout();
    } catch {}
    set({ user: null, status: "unauthenticated" });
  },
}));
