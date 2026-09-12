import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useIsAdmin } from "./AuthContext";

/**
 * Blocks a route from a teacher account even via a direct URL — hiding the
 * sidebar link alone isn't real access control.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const isAdmin = useIsAdmin();
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
