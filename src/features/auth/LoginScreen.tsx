import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Copy, KeyRound, LogIn } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Logo } from "@/components/ui/Logo";
import { useAuth, type AuthUser } from "./AuthContext";

type Mode = "login" | "forgot" | "recovered";

export function LoginScreen() {
  const { login } = useAuth();
  const [mode, setMode] = useState<Mode>("login");

  return (
    <div className="flex h-full items-center justify-center bg-surface-muted p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="h-14 w-14" />
          <h1 className="mt-3 text-lg font-semibold text-text">MNA Management System</h1>
        </div>

        {mode === "login" && <LoginForm onLoggedIn={login} onForgot={() => setMode("forgot")} />}
        {mode !== "login" && <ForgotPasswordForm onDone={() => setMode("login")} />}
      </div>
    </div>
  );
}

function LoginForm({
  onLoggedIn,
  onForgot,
}: {
  onLoggedIn: (u: AuthUser) => void;
  onForgot: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!username.trim() || !password) return;
    setBusy(true);
    try {
      const user = await invoke<AuthUser>("verify_login", { username, password });
      onLoggedIn(user);
    } catch (e) {
      toast.error(typeof e === "string" ? e : "Incorrect username or password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Field label="Username">
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          autoFocus
        />
      </Field>
      <Field label="Password">
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </Field>
      <Button className="w-full" onClick={submit} loading={busy}>
        <LogIn className="h-4 w-4" />
        Log in
      </Button>
      <button
        type="button"
        onClick={onForgot}
        className="w-full text-center text-xs text-text-muted hover:text-text hover:underline"
      >
        Forgot your password?
      </button>
    </div>
  );
}

function ForgotPasswordForm({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);

  async function submit() {
    if (newPassword.length < 4) {
      toast.error("Password must be at least 4 characters.");
      return;
    }
    if (newPassword !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const freshCode = await invoke<string>("reset_password_with_recovery_code", {
        username,
        recoveryCode: code,
        newPassword,
      });
      setNewCode(freshCode);
    } catch (e) {
      toast.error(typeof e === "string" ? e : "Could not reset the password.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!newCode) return;
    try {
      await navigator.clipboard.writeText(newCode);
      toast.success("Copied.");
    } catch {
      toast.error("Could not copy — select and copy the code manually.");
    }
  }

  if (newCode) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-text-muted">
          Password reset. Your old recovery code is now used up — here's your new one.
        </p>
        <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-muted px-4 py-3">
          <KeyRound className="h-4 w-4 shrink-0 text-text-muted" />
          <span className="select-all font-mono text-lg tracking-wider text-text">{newCode}</span>
          <Button variant="ghost" size="icon" aria-label="Copy recovery code" onClick={copyCode}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <Button className="w-full" onClick={onDone}>
          Back to login
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        Enter your username and recovery code to set a new password.
      </p>
      <Field label="Username">
        <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
      </Field>
      <Field label="Recovery code">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXX-XXXX-XXXX"
          className="font-mono uppercase"
        />
      </Field>
      <Field label="New password">
        <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
      </Field>
      <Field label="Confirm new password">
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <Button className="w-full" onClick={submit} loading={busy}>
        Reset password
      </Button>
      <button
        type="button"
        onClick={onDone}
        className="w-full text-center text-xs text-text-muted hover:text-text hover:underline"
      >
        Back to login
      </button>
    </div>
  );
}
