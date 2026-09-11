import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

export const DB_URL = "sqlite:mna.db";

let instance: Database | null = null;
let loading: Promise<Database> | null = null;

/** Shared SQLite handle. Migrations run automatically on first load. */
export async function getDb(): Promise<Database> {
  if (instance) return instance;
  if (!loading) {
    loading = Database.load(DB_URL).then((db) => {
      instance = db;
      return db;
    });
  }
  return loading;
}

export async function select<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = await getDb();
  return db.select<T[]>(sql, params);
}

/** Returns the first row, or `null` (never `undefined`, so it is safe as a React Query result). */
export async function selectOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await select<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(sql: string, params: unknown[] = []) {
  const db = await getDb();
  return db.execute(sql, params);
}

export interface BatchStatement {
  sql: string;
  params?: unknown[];
}

/**
 * Run several INSERT/UPDATE/DELETE statements atomically in one round-trip,
 * via a Rust-side transaction — use this instead of looping `execute()` for
 * any write that touches more than a couple of rows (attendance registers,
 * results grids, promotions, imports). A statement can reference the row
 * inserted by the one before it with `last_insert_rowid()`.
 */
export async function executeBatch(statements: BatchStatement[]): Promise<void> {
  if (!statements.length) return;
  await invoke("execute_transaction", {
    statements: statements.map((s) => ({ sql: s.sql, params: s.params ?? [] })),
  });
}
