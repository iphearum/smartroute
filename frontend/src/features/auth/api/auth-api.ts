import { api, ApiError } from "@/shared/api/http";
import type {
  AuthUser,
  LoginPayload,
  SignupPayload,
  UserPublicResponse,
} from "../domain/types";

function toAuthUser(raw: UserPublicResponse): AuthUser {
  return {
    id: raw.id,
    email: raw.email,
    displayName: raw.display_name,
    createdAt: raw.created_at,
  };
}

export const authApi = {
  signup: async (payload: SignupPayload) =>
    toAuthUser(
      await api<UserPublicResponse>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email: payload.email,
          password: payload.password,
          display_name: payload.displayName,
        }),
      }),
    ),
  login: async (payload: LoginPayload) =>
    toAuthUser(
      await api<UserPublicResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    ),
  logout: () => api<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  me: async (): Promise<AuthUser | null> => {
    try {
      return toAuthUser(await api<UserPublicResponse>("/auth/me"));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
};
