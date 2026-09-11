import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn(async () => ({
      select: vi.fn(async () => state.rows),
      execute: vi.fn(async () => ({ rowsAffected: 1, lastInsertId: 7 })),
    })),
  },
}));

import { execute, select, selectOne } from "./db";

beforeEach(() => {
  state.rows = [];
});

describe("selectOne", () => {
  it("returns null (never undefined) when there are no rows", async () => {
    state.rows = [];
    await expect(selectOne("SELECT 1")).resolves.toBeNull();
  });
  it("returns the first row when there are results", async () => {
    state.rows = [{ id: 1 }, { id: 2 }];
    await expect(selectOne("SELECT *")).resolves.toEqual({ id: 1 });
  });
});

describe("select / execute", () => {
  it("select returns every row", async () => {
    state.rows = [{ a: 1 }, { a: 2 }];
    await expect(select("SELECT *")).resolves.toEqual([{ a: 1 }, { a: 2 }]);
  });
  it("execute resolves with the driver result", async () => {
    await expect(execute("UPDATE settings SET x = 1")).resolves.toEqual({
      rowsAffected: 1,
      lastInsertId: 7,
    });
  });
});
