import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

/** A single exportable column: how to label it and how to read its value off a row. */
export interface ExportColumn<T> {
  key: string;
  label: string;
  value: (row: T) => string;
}

export type ExportFormat = "pdf" | "xlsx" | "csv";

const EXTENSION: Record<ExportFormat, string> = { pdf: "pdf", xlsx: "xlsx", csv: "csv" };
const FILTER_NAME: Record<ExportFormat, string> = {
  pdf: "PDF document",
  xlsx: "Excel workbook",
  csv: "CSV file",
};

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function toCsvBase64<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const header = columns.map((c) => csvCell(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(c.value(r) ?? "")).join(","));
  // A leading BOM so Excel opens UTF-8 (e.g. accented names) correctly.
  return utf8ToBase64("﻿" + [header, ...body].join("\r\n"));
}

/** Sheet names can't hold : \ / ? * [ ] and are capped at 31 characters. */
function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").trim();
  return (cleaned || "Sheet1").slice(0, 31);
}

async function toXlsxBase64<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  sheetName: string,
): Promise<string> {
  const XLSX = await import("xlsx");
  const data = [columns.map((c) => c.label), ...rows.map((r) => columns.map((c) => c.value(r)))];
  const sheet = XLSX.utils.aoa_to_sheet(data);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sanitizeSheetName(sheetName));
  return XLSX.write(book, { type: "base64", bookType: "xlsx" }) as string;
}

async function toPdfBase64<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  title: string,
): Promise<string> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });

  doc.setFontSize(14);
  doc.text(title, 24, 32);
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(
    `${rows.length} record${rows.length === 1 ? "" : "s"} · generated ${new Date().toLocaleDateString()}`,
    24,
    46,
  );

  autoTable(doc, {
    startY: 58,
    head: [columns.map((c) => c.label)],
    body: rows.map((r) => columns.map((c) => c.value(r))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [4, 120, 87] },
    margin: { left: 24, right: 24 },
  });

  return doc.output("datauristring").split(",")[1];
}

/**
 * Exports `rows` (restricted to `columns`) to a file the user saves via a
 * native save dialog. PDF/Excel libraries are loaded on demand so they never
 * bloat the main bundle. Returns false if the user cancels the save dialog.
 */
export async function exportRows<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  format: ExportFormat,
  opts: { fileBaseName: string; title?: string; sheetName?: string },
): Promise<boolean> {
  if (!columns.length) throw new Error("Choose at least one field to export.");

  const dataB64 =
    format === "csv"
      ? toCsvBase64(rows, columns)
      : format === "xlsx"
        ? await toXlsxBase64(rows, columns, opts.sheetName ?? opts.fileBaseName)
        : await toPdfBase64(rows, columns, opts.title ?? opts.fileBaseName);

  const dest = await save({
    defaultPath: `${opts.fileBaseName}.${EXTENSION[format]}`,
    filters: [{ name: FILTER_NAME[format], extensions: [EXTENSION[format]] }],
  });
  if (!dest) return false;
  await invoke("save_binary_file", { destPath: dest, dataB64 });
  return true;
}
