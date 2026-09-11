import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Download, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select, Textarea } from "@/components/ui/Input";
import { LoadingBlock } from "@/components/ui/State";
import { cn } from "@/lib/cn";
import { savePdf } from "@/lib/pdf";
import { useCurrentYear, useNamedList, useSettings } from "@/features/settings/api";
import { useClassGradebook, useSaveGeneralRemark } from "./api";
import { ReportCard, type ReportCardData } from "./ReportCard";

export function ReportCardPage() {
  const { data: settings } = useSettings();
  const { data: year } = useCurrentYear();
  const { data: classes = [] } = useNamedList("classes");

  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<"single" | "class">("single");
  const [classId, setClassId] = useState<number | null>(null);
  const [studentId, setStudentId] = useState<number | null>(null);

  // Deep link from the student profile page: /report-cards?class=..&student=..
  useEffect(() => {
    const c = Number(searchParams.get("class"));
    const s = Number(searchParams.get("student"));
    if (c) setClassId(c);
    if (s) {
      setMode("single");
      setStudentId(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (classId == null && classes.length) setClassId(classes[0].id);
  }, [classes, classId]);

  const gb = useClassGradebook(classId, year?.id ?? null);
  const saveRemark = useSaveGeneralRemark();

  useEffect(() => {
    if (gb.students.length && !gb.students.some((s) => s.student_id === studentId)) {
      setStudentId(gb.students[0].student_id);
    }
  }, [gb.students, studentId]);

  const schoolName = settings?.school_name ?? "Madrasatul Nurul Absar";
  const yearLabel = year ? `${year.hijri_label} AH · ${year.gregorian_label}` : "";

  const cards = useMemo<ReportCardData[]>(() => {
    if (!year) return [];
    return gb.gradebook.map((entry) => {
      const info = gb.students.find((s) => s.student_id === entry.student_id);
      return {
        schoolName,
        yearLabel,
        student: {
          full_name: entry.full_name,
          student_code: entry.student_code,
          class_name: info?.class_name ?? null,
          gender: info?.gender ?? null,
        },
        entry,
        attendance: gb.attendanceMap.get(entry.student_id),
        classSize: gb.gradebook.length,
        generalRemark: gb.remarkMap.get(entry.student_id) ?? null,
      };
    });
  }, [gb.gradebook, gb.students, gb.attendanceMap, gb.remarkMap, schoolName, yearLabel, year]);

  const single = cards.find((c) => c.entry.student_id === studentId) ?? null;

  const [remarkDraft, setRemarkDraft] = useState("");
  useEffect(() => {
    setRemarkDraft(single?.generalRemark ?? "");
  }, [single?.entry.student_id, single?.generalRemark]);

  async function saveRemarkNow() {
    if (!single || !year) return;
    try {
      await saveRemark.mutateAsync({
        studentId: single.entry.student_id,
        yearId: year.id,
        remark: remarkDraft.trim() || null,
      });
      toast.success("Remark saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the remark.");
    }
  }

  const printAreaRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const className = classes.find((c) => c.id === classId)?.name ?? "class";

  async function downloadPdf() {
    const nodes = Array.from(
      printAreaRef.current?.querySelectorAll<HTMLElement>(".report-card") ?? [],
    );
    if (!nodes.length) return;
    const name =
      mode === "single" && single
        ? `Report card - ${single.student.full_name} - ${yearLabel}`
        : `Report cards - ${className} - ${yearLabel}`;
    try {
      setExporting(true);
      const saved = await savePdf(nodes, name.replace(/[/\\:]/g, "-"));
      if (saved) toast.success("PDF saved.");
    } catch (e) {
      toast.error(typeof e === "string" ? e : e instanceof Error ? e.message : "Could not export the PDF.");
    } finally {
      setExporting(false);
    }
  }

  const nothingToPrint = mode === "single" ? !single : cards.length === 0;

  if (!year) {
    return (
      <div className="rounded-xl border border-border bg-surface px-6 py-16 text-center">
        <FileText className="mx-auto h-8 w-8 text-text-muted" />
        <p className="mt-3 text-sm text-text-muted">
          Set a current academic year in Settings to produce report cards.
        </p>
      </div>
    );
  }

  const withMarks = cards.filter((c) => c.entry.average != null).length;

  return (
    <div className="space-y-5">
      <div className="no-print">
        <h2 className="text-xl font-semibold text-text">Report cards</h2>
        <p className="mt-1 text-sm text-text-muted">
          {yearLabel}. Pulls results, positions and attendance automatically.
        </p>
      </div>

      <div className="no-print flex flex-wrap items-end gap-3">
        <div className="flex gap-1 self-end rounded-lg border border-border p-1">
          {(["single", "class"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                mode === m ? "bg-accent-soft text-primary" : "text-text-muted hover:text-text",
              )}
            >
              {m === "single" ? "Single student" : "Whole class"}
            </button>
          ))}
        </div>
        <Field label="Class" className="w-44">
          <Select
            value={classId ?? ""}
            onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : null)}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {mode === "single" && (
          <Field label="Student" className="w-56">
            <Select
              value={studentId ?? ""}
              onChange={(e) => setStudentId(e.target.value ? Number(e.target.value) : null)}
            >
              {gb.students.map((s) => (
                <option key={s.student_id} value={s.student_id}>
                  {s.full_name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="flex gap-2 self-end">
          <Button variant="outline" onClick={() => window.print()} disabled={nothingToPrint}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button onClick={downloadPdf} loading={exporting} disabled={nothingToPrint}>
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
        </div>
      </div>

      {gb.isLoading ? (
        <LoadingBlock />
      ) : mode === "single" ? (
        <>
          {single && (
            <div className="no-print rounded-xl border border-border bg-surface p-4">
              <Field label="Teacher's general remark">
                <Textarea
                  value={remarkDraft}
                  onChange={(e) => setRemarkDraft(e.target.value)}
                  placeholder="Overall comment for this student…"
                />
              </Field>
              <div className="mt-2 flex justify-end">
                <Button size="sm" onClick={saveRemarkNow} loading={saveRemark.isPending}>
                  Save remark
                </Button>
              </div>
            </div>
          )}
          <div id="print-area" ref={printAreaRef}>
            {single ? (
              <div className="overflow-x-auto rounded-xl border border-border bg-slate-200 p-4 dark:bg-slate-800">
                <ReportCard data={{ ...single, generalRemark: remarkDraft.trim() || null }} />
              </div>
            ) : (
              <p className="text-sm text-text-muted">No students in this class.</p>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="no-print rounded-xl border border-border bg-surface px-5 py-4 text-sm text-text-muted">
            {cards.length} student{cards.length === 1 ? "" : "s"} in this class · {withMarks} with
            results entered. Each report card prints on its own page.
          </div>
          {/* rendered off-screen so Print and PDF export can reach it; on-page for @media print */}
          <div
            id="print-area"
            ref={printAreaRef}
            className="pointer-events-none fixed left-[-10000px] top-0 print:static print:left-auto print:pointer-events-auto"
          >
            {cards.map((c) => (
              <ReportCard key={c.entry.student_id} data={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
