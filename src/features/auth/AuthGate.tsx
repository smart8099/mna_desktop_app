import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LoadingBlock } from "@/components/ui/State";
import { useAuth } from "./AuthContext";
import { SetupScreen } from "./SetupScreen";
import { LoginScreen } from "./LoginScreen";

/**
 * The very first thing rendered: no account yet -> one-time setup, an
 * account but no active session -> login, otherwise the real app.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);

  useEffect(() => {
    if (user) return; // already signed in this session — nothing to check
    let cancelled = false;
    invoke<boolean>("has_any_users")
      .then((v) => !cancelled && setHasUsers(v))
      .catch(() => !cancelled && setHasUsers(true)); // fail safe: never skip login on error
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (user) return <>{children}</>;
  if (hasUsers === null) return <LoadingBlock />;
  if (!hasUsers) return <SetupScreen />;
  return <LoginScreen />;
}
