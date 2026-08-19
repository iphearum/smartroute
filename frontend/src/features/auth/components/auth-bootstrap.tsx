"use client";
import { useBootstrapSession } from "../hooks/use-bootstrap-session";

export function AuthBootstrap() {
  useBootstrapSession();
  return null;
}
