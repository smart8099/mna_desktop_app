import type { ReactElement, ReactNode } from "react";
import { vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, type AuthUser } from "@/features/auth/AuthContext";

/** Mockable Tauri `invoke` + dialog, dispatched by command name. */
export function createTauriMock() {
  const handlers: Record<string, (args?: unknown) => unknown> = {};
  const invoke = vi.fn(async (cmd: string, args?: unknown) =>
    cmd in handlers ? handlers[cmd](args) : undefined,
  );
  const open = vi.fn(async () => null as string | null);
  const save = vi.fn(async () => null as string | null);
  return {
    core: { invoke },
    dialog: { open, save },
    onInvoke(cmd: string, fn: (args?: unknown) => unknown) {
      handlers[cmd] = fn;
    },
    reset() {
      for (const k of Object.keys(handlers)) delete handlers[k];
      invoke.mockClear();
      open.mockReset().mockResolvedValue(null);
      save.mockReset().mockResolvedValue(null);
    },
  };
}

/**
 * Shared singleton so a test file and its `vi.mock("@tauri-apps/api/core")` /
 * `vi.mock("@tauri-apps/plugin-dialog")` reference the same fake. Defined
 * before `db` below, which calls into `tauri.core.invoke` directly (NOT via
 * an import of "@tauri-apps/api/core" — that module is itself mocked from
 * this file in test files, and importing it here too would be circular).
 */
export const tauri = createTauriMock();

type Row = Record<string, unknown>;
type Handler = (sql: string, params: unknown[]) => Row[] | undefined;

/**
 * A pattern-matched fake for `@/lib/db`. Tests register handlers keyed by a
 * regex against the (whitespace-normalised) SQL string; the first match wins,
 * otherwise `select` returns `[]`. `execute` records every call.
 */
export function createDbMock() {
  const handlers: { match: RegExp; fn: Handler }[] = [];

  const select = async (sql: string, params: unknown[] = []) => {
    const h = handlers.find((x) => x.match.test(sql.replace(/\s+/g, " ")));
    return h?.fn(sql, params) ?? [];
  };
  const selectOne = async (sql: string, params: unknown[] = []) => {
    const rows = await select(sql, params);
    return rows[0] ?? null;
  };
  const execute = vi.fn(
    async (_sql: string, _params: unknown[] = []) => ({ rowsAffected: 1, lastInsertId: 999 }),
  );
  // Mirrors the real executeBatch: routes through invoke("execute_transaction", ...)
  // so it exercises the same mocked Tauri bridge tests register handlers against.
  const executeBatch = async (statements: { sql: string; params?: unknown[] }[]) => {
    if (!statements.length) return;
    await tauri.core.invoke("execute_transaction", {
      statements: statements.map((s) => ({ sql: s.sql, params: s.params ?? [] })),
    });
  };

  return {
    module: { select, selectOne, execute, executeBatch, getDb: vi.fn() },
    execute,
    // Newest registration wins when two patterns match the same SQL — lets a
    // test's own db.on() override a pattern baseFixtures() already covers,
    // without needing to touch shared setup.
    on(match: RegExp, fn: Handler) {
      handlers.unshift({ match, fn });
    },
    reset() {
      handlers.length = 0;
      execute.mockClear();
    },
    /** SQL strings passed to execute(), whitespace-normalised. */
    executed(): string[] {
      return execute.mock.calls.map((c: unknown[]) =>
        String(c[0]).replace(/\s+/g, " ").trim(),
      );
    },
  };
}

/** Shared singleton so a test file and its `vi.mock("@/lib/db")` reference the same fake. */
export const db = createDbMock();

const DEFAULT_TEST_USER: AuthUser = { id: 1, username: "test-admin", role: "admin" };

/**
 * `authUser` defaults to a stub admin so existing/most tests don't need to
 * think about auth at all (Topbar and other consumers of useAuth() just
 * work). Pass a teacher user to test role restrictions, or `null` to test
 * the logged-out state (AuthGate's login/setup screens).
 */
export function renderWithProviders(
  ui: ReactElement,
  opts: { route?: string; path?: string; authUser?: AuthUser | null } = {},
) {
  const authUser = opts.authUser === undefined ? DEFAULT_TEST_USER : opts.authUser;
  try {
    if (authUser) sessionStorage.setItem("mna.session-user", JSON.stringify(authUser));
    else sessionStorage.removeItem("mna.session-user");
  } catch {
    /* jsdom sessionStorage should always be available; ignore if not */
  }

  const queryClient: QueryClient = new QueryClient({
    mutationCache: new MutationCache({
      onSettled: (): void => {
        void queryClient.invalidateQueries();
      },
    }),
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });

  const wrapper = (children: ReactNode) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[opts.route ?? "/"]}>
          {opts.path ? (
            <Routes>
              <Route path={opts.path} element={children} />
            </Routes>
          ) : (
            children
          )}
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );

  return { queryClient, ...render(wrapper(ui)) };
}
