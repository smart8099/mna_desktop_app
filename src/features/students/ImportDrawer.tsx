import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { FileSpreadsheet, TriangleAlert } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { LoadingBlock } from "@/components/ui/State";
import { useQuery } from "@tanstack/react-query";
import { useNamedList } from "@/features/settings/api";
import { useImportStudents } from "./api";
import { planImport } from "./logic";
import { select } from "@/lib/db";
import type { ImportedStudent } from "./types";

export function ImportDrawer({ open: isOpen, onClose }: { open: boolean; onClose: () => void }) {
  const { data: classes = [] } = useNamedList("classes");
  const importStudents = useImportStudents();
  const [parsed, setParsed] = useState<ImportedStudent[] | null>(null);
  const [parsing, setParsing] = useState(false);

  const existing = useQuery({
    queryKey: ["students", "for-import-plan"],
    enabled: isOpen,
    queryFn: () =>
      select<{ admission_no: string | null; full_name: string }>(
        "SELECT admission_no, full_name FROM students",
      ),
  });

  const plan =
    parsed && existing.data
      ? planImport(
          parsed,
          existing.data.map((e) => e.admission_no ?? "").filter(Boolean),
          existing.data.map((e) => e.full_name),
          classes,
        )
      : [];
  const willImport = plan.filter((p) => p.action === "import").length;
  const willSkip = plan.length - willImport;
  const unknownClass = plan.filter((p) => p.action === "import" && p.classUnknown).length;

  async function choose() {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Excel workbook", extensions: ["xlsx", "xls", "xlsm"] }],
    });
    const path = typeof picked === "string" ? picked : null;
    if (!path) return;
    try {
      setParsing(true);
      const rows = await invoke<ImportedStudent[]>("parse_students_xlsx", { path });
      if (!rows.length) {
        toast.error("No student rows were found in that file.");
        return;
      }
      setParsed(rows);
    } catch (e) {
      toast.error(typeof e === "string" ? e : "Could not read that spreadsheet.");
    } finally {
      setParsing(false);
    }
  }

  async function run() {
    if (!parsed) return;
    try {
      const res = await importStudents.mutateAsync({ parsed, classes });
      toast.success(
        `Imported ${res.imported} student${res.imported === 1 ? "" : "s"}` +
          (res.skipped ? ` · skipped ${res.skipped} already on file` : "") +
          (res.unknownClass ? ` · ${res.unknownClass} without a matching class` : ""),
      );
      reset();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    }
  }

  function reset() {
    setParsed(null);
  }

  return (
    <Drawer
      open={isOpen}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Import students from a spreadsheet"
      description="One-time import from the legacy MNA workbook (the STUDENTS sheet)."
      footer={
        parsed ? (
          <>
            <Button variant="outline" onClick={reset}>
              Choose another file
            </Button>
            <Button onClick={run} loading={importStudents.isPending} disabled={willImport === 0}>
              Import {willImport} student{willImport === 1 ? "" : "s"}
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      {!parsed ? (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent-soft text-primary">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <p className="max-w-sm text-sm text-text-muted">
            Pick the <code>MNA_Management_System_EDITABLE.xlsx</code> file. Rows are matched to
            existing students by admission number, so importing twice is safe.
          </p>
          <Button onClick={choose} loading={parsing}>
            Choose spreadsheet file…
          </Button>
        </div>
      ) : existing.isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="green">{willImport} to import</Badge>
            {willSkip > 0 && <Badge tone="muted">{willSkip} already on file</Badge>}
            {unknownClass > 0 && (
              <Badge tone="amber">
                <TriangleAlert className="h-3 w-3" />
                {unknownClass} without a matching class
              </Badge>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-left text-xs text-text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Adm. no.</th>
                  <th className="px-3 py-2 font-medium">Class</th>
                  <th className="px-3 py-2 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {plan.map((p, i) => (
                  <tr key={i} className={p.action === "skip-duplicate" ? "opacity-55" : ""}>
                    <td className="px-3 py-2 text-text">{p.student.full_name}</td>
                    <td className="px-3 py-2 text-text-muted">{p.student.admission_no ?? "—"}</td>
                    <td className="px-3 py-2 text-text-muted">
                      {p.student.class_name ?? "—"}
                      {p.classUnknown && <span className="text-warning"> (unknown)</span>}
                    </td>
                    <td className="px-3 py-2">
                      {p.action === "import" ? (
                        <span className="text-primary">Import</span>
                      ) : (
                        <span className="text-text-muted">Skip — already on file</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-text-muted">
            Students without a matching class are still imported — set their class afterwards, or add
            the class in Settings first and re-run.
          </p>
        </div>
      )}
    </Drawer>
  );
}
