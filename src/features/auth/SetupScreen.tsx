import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Check, Copy, KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Logo } from "@/components/ui/Logo";
import { useAuth, type AuthUser } from "./AuthContext";

/**
 * Shown exactly once, the very first time the app runs: creates the first
 * (admin) account and displays its one-time recovery code. There is no
 * password to log in with yet, so this can't be gated behind a login check.
 */
export function SetupScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pendingUser, setPendingUser] = useState<AuthUser | null>(null);

  async function submit() {
    if (password.length < 4) {
      toast.error("Password must be at least 4 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const code = await invoke<string>("create_first_admin", { username, password });
      const user = await invoke<AuthUser>("verify_login", { username, password });
      setRecoveryCode(code);
      setPendingUser(user);
    } catch (e) {
      toast.error(typeof e === "string" ? e : "Could not create the account.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!recoveryCode) return;
    try {
      await navigator.clipboard.writeText(recoveryCode);
      toast.success("Copied.");
    } catch {
      toast.error("Could not copy — select and copy the code manually.");
    }
  }

  function finish() {
    if (pendingUser) login(pendingUser);
  }

  return (
    <div className="flex h-full items-center justify-center bg-surface-muted p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="h-14 w-14" />
          <h1 className="mt-3 text-lg font-semibold text-text">Welcome to MNA Management</h1>
          <p className="mt-1 text-sm text-text-muted">
            {recoveryCode
              ? "Save your recovery code before continuing."
              : "Set up the first administrator account."}
          </p>
        </div>

        {!recoveryCode ? (
          <div className="space-y-4">
            <Field label="Username">
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </Field>
            <Field label="Password" hint="At least 4 characters.">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </Field>
            <Field label="Confirm password">
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </Field>
            <Button className="w-full" onClick={submit} loading={busy}>
              <ShieldCheck className="h-4 w-4" />
              Create admin account
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
              This code is the only way back in if you forget your password. It won't be shown
              again — write it down or store it somewhere safe now.
            </div>
            <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-muted px-4 py-3">
              <KeyRound className="h-4 w-4 shrink-0 text-text-muted" />
              <span className="select-all font-mono text-lg tracking-wider text-text">
                {recoveryCode}
              </span>
              <Button variant="ghost" size="icon" aria-label="Copy recovery code" onClick={copyCode}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--color-primary)]"
                checked={saved}
                onChange={(e) => setSaved(e.target.checked)}
              />
              I've saved this recovery code somewhere safe.
            </label>
            <Button className="w-full" onClick={finish} disabled={!saved}>
              <Check className="h-4 w-4" />
              Continue
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
