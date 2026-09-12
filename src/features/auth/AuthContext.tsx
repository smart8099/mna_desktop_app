import { createContext, useContext, useState, type ReactNode } from "react";

export type Role = "admin" | "teacher";

export interface AuthUser {
  id: number;
  username: string;
  role: Role;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_KEY = "mna.session-user";

/**
 * Held in sessionStorage, not localStorage: it survives an accidental page
 * reload (Vite HMR, etc.) within the same running app window, but a fresh
 * app launch always gets a fresh webview session — so restarting the app
 * always requires logging in again, which is the whole point of a login
 * screen. Never stored across real restarts, and never holds a password.
 */
function readSession(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readSession());

  function login(u: AuthUser) {
    setUser(u);
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(u));
    } catch {
      // sessionStorage can throw in a locked-down webview context; login
      // still works for this run, it just won't survive an HMR reload.
    }
  }

  function logout() {
    setUser(null);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* see above */
    }
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** True for an admin, false for a teacher or a signed-out state. */
export function useIsAdmin(): boolean {
  const { user } = useAuth();
  return user?.role === "admin";
}
