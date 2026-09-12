import { invoke } from "@tauri-apps/api/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { select } from "@/lib/db";
import type { Role } from "./AuthContext";

export interface Account {
  id: number;
  username: string;
  role: Role;
  created_at: string;
}

/**
 * Deliberately never selects password_hash / recovery_code_hash — those
 * only ever get read/compared inside the Rust auth module.
 */
export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: () =>
      select<Account>("SELECT id, username, role, created_at FROM users ORDER BY created_at"),
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { username: string; password: string; role: Role }) =>
      invoke<void>("create_user", p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });
}

export function useChangeOwnPassword() {
  return useMutation({
    mutationFn: (p: { userId: number; currentPassword: string; newPassword: string }) =>
      invoke<void>("change_password", p),
  });
}
