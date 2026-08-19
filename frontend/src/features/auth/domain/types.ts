export interface AuthUser {
  id: number;
  email: string;
  displayName: string | null;
  createdAt: string;
}
export interface SignupPayload {
  email: string;
  password: string;
  displayName?: string;
}
export interface LoginPayload {
  email: string;
  password: string;
}
export interface UserPublicResponse {
  id: number;
  email: string;
  display_name: string | null;
  created_at: string;
}
