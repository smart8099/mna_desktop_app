import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, Printer, Table2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";
import { exportRows, type ExportFormat } from "@/lib/exportRows";
import { DEFAULT_STUDENT_EXPORT_KEYS, STUDENT_EXPORT_FIELDS, studentExportColumns } from "./export";
import type { StudentRow } from "./types";

const FORMATS: { id: ExportFormat; label: string; icon: typeof FileText }[] = [
  { id: "pdf", label: "PDF", icon: FileText },
  { id: "xlsx", label: "Excel", icon: FileSpreadsheet },
  { id: "csv", label: "CSV", icon: Table2 },
];

/** A short filesystem-safe slug for the default filename, e.g. "JSS 1B" -> "jss-1b". */
export function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "students";
}

export function PrintRegisterDialog({
  open,
  onClose,
  rows,
  scopeLabel,
}: {
  open: boolean;
  onClose: () => void;
  rows: StudentRow[];
  scopeLabel: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(DEFAULT_STUDENT_EXPORT_KEYS));
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [exporting, setExporting] = useState(false);

  function toggle(key: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleExport() {
    if (selected.size === 0) {
      toast.error("Choose at least one field to export.");
      return;
    }
    setExporting(true);
    try {
      const columns = studentExportColumns(selected);
      const saved = await exportRows(rows, columns, format, {
        fileBaseName: `mna-students-${slugify(scopeLabel)}-${new Date().toISOString().slice(0, 10)}`,
        title: `Student Register — ${scopeLabel}`,
        sheetName: "Students",
      });
      if (saved) {
        toast.success(`Exported ${rows.length} student${rows.length === 1 ? "" : "s"}.`);
        onClose();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Print register"
      description={`${scopeLabel} · ${rows.length} student${rows.length === 1 ? "" : "s"}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleExport} loading={exporting} disabled={rows.length === 0}>
            <Printer className="h-4 w-4" />
            Export
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium text-text">Fields to include</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {STUDENT_EXPORT_FIELDS.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--color-primary)]"
                  checked={selected.has(f.key)}
                  onChange={() => toggle(f.key)}
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-text">Format</p>
          <div className="flex gap-2">
            {FORMATS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setFormat(id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  format === id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-surface text-text-muted hover:text-text",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
