import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, UserPlus } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { LoadingBlock, ErrorBlock, EmptyRow } from "@/components/ui/State";
import { useAuth, type Role } from "@/features/auth/AuthContext";
import { useAccounts, useChangeOwnPassword, useCreateAccount } from "@/features/auth/api";

export function SecuritySection() {
  return (
    <div className="space-y-6">
      <AccountsCard />
      <ChangePasswordCard />
    </div>
  );
}

function AccountsCard() {
  const { data: accounts, isLoading, error } = useAccounts();
  const createAccount = useCreateAccount();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("teacher");

  async function add() {
    if (!username.trim() || password.length < 4) {
      toast.error("Enter a username and a password of at least 4 characters.");
      return;
    }
    try {
      await createAccount.mutateAsync({ username: username.trim(), password, role });
      setUsername("");
      setPassword("");
      setRole("teacher");
      toast.success(`Account created for ${username.trim()}.`);
    } catch (e) {
      toast.error(typeof e === "string" ? e : e instanceof Error ? e.message : "Could not create the account.");
    }
  }

  return (
    <Card>
      <CardHeader
        title="Accounts"
        description="Everyone who can log in. Teachers have limited access — no Settings, no Backup, and no deletion rights anywhere."
      />
      <CardBody className="space-y-4">
        <div className="overflow-hidden rounded-lg border border-border">
          {isLoading ? (
            <LoadingBlock />
          ) : error ? (
            <ErrorBlock error={error} />
          ) : !accounts?.length ? (
            <EmptyRow>No accounts yet.</EmptyRow>
          ) : (
            <ul className="divide-y divide-border">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <span className="flex-1 font-medium text-text">{a.username}</span>
                  <Badge tone={a.role === "admin" ? "green" : "muted"}>{a.role}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <Field label="Username">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field label="Password" hint="At least 4 characters.">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          <Button onClick={add} loading={createAccount.isPending}>
            <UserPlus className="h-4 w-4" />
            Add account
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function ChangePasswordCard() {
  const { user } = useAuth();
  const changePassword = useChangeOwnPassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  async function submit() {
    if (!user) return;
    if (next.length < 4) {
      toast.error("New password must be at least 4 characters.");
      return;
    }
    if (next !== confirm) {
      toast.error("New passwords don't match.");
      return;
    }
    try {
      await changePassword.mutateAsync({ userId: user.id, currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Password changed.");
    } catch (e) {
      toast.error(typeof e === "string" ? e : e instanceof Error ? e.message : "Could not change the password.");
    }
  }

  return (
    <Card>
      <CardHeader title="Your password" description={`Signed in as ${user?.username ?? "—"}.`} />
      <CardBody className="grid gap-4 sm:grid-cols-3">
        <Field label="Current password">
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new password">
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <div className="sm:col-span-3">
          <Button onClick={submit} loading={changePassword.isPending}>
            <KeyRound className="h-4 w-4" />
            Change password
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
