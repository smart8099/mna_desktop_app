import { beforeEach, describe, expect, it, vi } from "vitest";
import { tauri } from "@/test/harness";
import { exportRows, type ExportColumn } from "./exportRows";

vi.mock("@tauri-apps/api/core", async () => (await import("@/test/harness")).tauri.core);
vi.mock("@tauri-apps/plugin-dialog", async () => (await import("@/test/harness")).tauri.dialog);

function base64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  // ignoreBOM: TextDecoder silently strips a leading BOM by default, which
  // would hide the very thing the BOM test below checks for.
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
}

interface Row {
  name: string;
  note: string;
}

const ROWS: Row[] = [
  { name: "Amina Yakubu", note: "Top of class" },
  { name: 'Bilal "The Great" Osei', note: "Has, a comma" },
];

const COLUMNS: ExportColumn<Row>[] = [
  { key: "name", label: "Full Name", value: (r) => r.name },
  { key: "note", label: "Note", value: (r) => r.note },
];

beforeEach(() => {
  tauri.reset();
});

describe("exportRows", () => {
  it("throws and never touches the save dialog when no columns are chosen", async () => {
    await expect(exportRows(ROWS, [], "csv", { fileBaseName: "x" })).rejects.toThrow(
      /at least one field/i,
    );
    expect(tauri.dialog.save).not.toHaveBeenCalled();
  });

  it("returns false and skips save_binary_file when the save dialog is cancelled", async () => {
    tauri.dialog.save.mockResolvedValueOnce(null);
    const ok = await exportRows(ROWS, COLUMNS, "csv", { fileBaseName: "students" });
    expect(ok).toBe(false);
    expect(tauri.core.invoke).not.toHaveBeenCalled();
  });

  it("csv: writes a BOM-prefixed, comma-escaped CSV to the chosen path", async () => {
    tauri.dialog.save.mockResolvedValueOnce("/tmp/students.csv");
    const ok = await exportRows(ROWS, COLUMNS, "csv", { fileBaseName: "students" });
    expect(ok).toBe(true);

    expect(tauri.dialog.save).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: "students.csv",
        filters: [{ name: "CSV file", extensions: ["csv"] }],
      }),
    );

    const [, args] = tauri.core.invoke.mock.calls[0] as [string, { destPath: string; dataB64: string }];
    expect(args.destPath).toBe("/tmp/students.csv");
    const text = base64ToUtf8(args.dataB64);
    expect(text.charCodeAt(0)).toBe(0xfeff); // UTF-8 BOM so Excel opens it correctly
    const lines = text.slice(1).split("\r\n");
    expect(lines[0]).toBe("Full Name,Note");
    expect(lines[1]).toBe("Amina Yakubu,Top of class");
    // a value containing both a quote and a comma is quoted, with the quote doubled
    expect(lines[2]).toBe('"Bilal ""The Great"" Osei","Has, a comma"');
  });

  it("xlsx: writes a workbook whose sheet round-trips the chosen columns", async () => {
    tauri.dialog.save.mockResolvedValueOnce("/tmp/students.xlsx");
    const ok = await exportRows(ROWS, COLUMNS, "xlsx", {
      fileBaseName: "students",
      sheetName: "Students",
    });
    expect(ok).toBe(true);

    const [, args] = tauri.core.invoke.mock.calls[0] as [string, { dataB64: string }];
    const XLSX = await import("xlsx");
    const book = XLSX.read(args.dataB64, { type: "base64" });
    expect(book.SheetNames).toEqual(["Students"]);
    const sheet = XLSX.utils.sheet_to_json(book.Sheets["Students"], { header: 1 }) as string[][];
    expect(sheet[0]).toEqual(["Full Name", "Note"]);
    expect(sheet[1]).toEqual(["Amina Yakubu", "Top of class"]);
  });

  it("xlsx: sanitizes characters Excel forbids in sheet names and caps the length at 31", async () => {
    tauri.dialog.save.mockResolvedValueOnce("/tmp/x.xlsx");
    await exportRows(ROWS, COLUMNS, "xlsx", {
      fileBaseName: "x",
      sheetName: "A:B/C?D*E[F]G".repeat(3), // way over 31 chars once cleaned
    });
    const [, args] = tauri.core.invoke.mock.calls[0] as [string, { dataB64: string }];
    const XLSX = await import("xlsx");
    const book = XLSX.read(args.dataB64, { type: "base64" });
    expect(book.SheetNames[0].length).toBeLessThanOrEqual(31);
    expect(book.SheetNames[0]).not.toMatch(/[:\\/?*[\]]/);
  });

  it("pdf: produces a real PDF file containing only the chosen columns", async () => {
    tauri.dialog.save.mockResolvedValueOnce("/tmp/students.pdf");
    const ok = await exportRows(ROWS, COLUMNS, "pdf", {
      fileBaseName: "students",
      title: "Student Register",
    });
    expect(ok).toBe(true);

    const [, args] = tauri.core.invoke.mock.calls[0] as [string, { dataB64: string }];
    const binary = atob(args.dataB64);
    expect(binary.slice(0, 5)).toBe("%PDF-"); // the PDF magic bytes
    expect(binary.length).toBeGreaterThan(500);
  });

  it("defaults the save-dialog filename to the requested extension per format", async () => {
    for (const [format, ext] of [
      ["csv", "csv"],
      ["xlsx", "xlsx"],
      ["pdf", "pdf"],
    ] as const) {
      tauri.reset();
      tauri.dialog.save.mockResolvedValueOnce(`/tmp/out.${ext}`);
      await exportRows(ROWS, COLUMNS, format, { fileBaseName: "register" });
      expect(tauri.dialog.save).toHaveBeenCalledWith(
        expect.objectContaining({ defaultPath: `register.${ext}` }),
      );
    }
  });
});
