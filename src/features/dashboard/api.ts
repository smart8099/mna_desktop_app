import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { select } from "@/lib/db";
import { useSettings } from "@/features/settings/api";
import { rateCase } from "@/features/fees/api";
import { useGradingConfig } from "@/features/results/api";
import { gradeFor, resolveWeights, weightedTotal } from "@/features/results/logic";

interface NameCount {
  name: string;
  n: number;
}
interface AttByClass {
  name: string;
  present: number;
  total: number;
}
interface RawResult {
  subject_id: number;
  class_id: number | null;
  ca_mark: number;
  exam_mark: number;
}

export function useDashboard(yearId: number | null) {
  const { data: settings } = useSettings();
  const grading = useGradingConfig();

  const weekend = Number(settings?.weekend_rate ?? 0);
  const vacation = Number(settings?.vacation_rate ?? 0);
  const examFee = Number(settings?.exam_fee ?? 0);

  const core = useQuery({
    queryKey: ["dashboard-core", yearId, weekend, vacation],
    enabled: !!settings,
    queryFn: async () => {
      const yid = yearId != null ? Number(yearId) : null;
      const yearWhere = yid != null ? `year_id = ${yid}` : "1 = 1";
      const attFilter = yid != null ? `AND a.year_id = ${yid}` : "";

      // None of these depend on each other — fire them concurrently instead of
      // one round-trip at a time.
      const [
        students,
        teachers,
        enrollment,
        tuitionPaid,
        tuitionDue,
        examPaid,
        attendanceOverall,
        attendanceByClass,
        resultsEntered,
      ] = await Promise.all([
        select<{ total: number; active: number }>(
          "SELECT COUNT(*) AS total, COALESCE(SUM(status = 'Active'), 0) AS active FROM students",
        ),
        select<{ n: number }>("SELECT COUNT(*) AS n FROM teachers WHERE status = 'Active'"),
        select<NameCount>(
          `SELECT c.name, COUNT(s.id) AS n
           FROM classes c LEFT JOIN students s ON s.class_id = c.id AND s.status = 'Active'
           GROUP BY c.id ORDER BY c.sort_order`,
        ),
        select<{ v: number }>(
          `SELECT COALESCE(SUM(amount), 0) AS v FROM fee_payments WHERE ${yearWhere}`,
        ),
        select<{ v: number }>(
          `SELECT COALESCE(SUM(${rateCase(weekend, vacation)}), 0) AS v
           FROM attendance a WHERE a.status = 'Present' ${attFilter}`,
        ),
        select<{ v: number }>(
          `SELECT COALESCE(SUM(amount_paid), 0) AS v FROM exam_fees WHERE ${yearWhere}`,
        ),
        select<{ present: number; total: number }>(
          `SELECT COALESCE(SUM(status = 'Present'), 0) AS present, COUNT(*) AS total
           FROM attendance a WHERE 1 = 1 ${attFilter}`,
        ),
        select<AttByClass>(
          `SELECT c.name,
                  COALESCE(SUM(a.status = 'Present'), 0) AS present,
                  COUNT(a.id) AS total
           FROM classes c
           LEFT JOIN students s ON s.class_id = c.id AND s.status = 'Active'
           LEFT JOIN attendance a ON a.student_id = s.id ${attFilter}
           GROUP BY c.id ORDER BY c.sort_order`,
        ),
        select<{ n: number }>(
          `SELECT COUNT(*) AS n FROM results
           WHERE ca_mark IS NOT NULL AND exam_mark IS NOT NULL
           ${yearId != null ? `AND year_id = ${Number(yearId)}` : ""}`,
        ),
      ]);

      return {
        totalStudents: students[0]?.total ?? 0,
        activeStudents: students[0]?.active ?? 0,
        teachers: teachers[0]?.n ?? 0,
        enrollmentByClass: enrollment,
        tuitionPaid: tuitionPaid[0]?.v ?? 0,
        tuitionDue: tuitionDue[0]?.v ?? 0,
        examPaid: examPaid[0]?.v ?? 0,
        attendancePresent: attendanceOverall[0]?.present ?? 0,
        attendanceTotal: attendanceOverall[0]?.total ?? 0,
        attendanceByClass,
        resultsEntered: resultsEntered[0]?.n ?? 0,
      };
    },
  });

  const rawResults = useQuery({
    queryKey: ["dashboard-results", yearId],
    enabled: !!settings,
    queryFn: () =>
      select<RawResult>(
        `SELECT r.subject_id, s.class_id, r.ca_mark, r.exam_mark
         FROM results r JOIN students s ON s.id = r.student_id
         WHERE r.ca_mark IS NOT NULL AND r.exam_mark IS NOT NULL
         ${yearId != null ? `AND r.year_id = ${Number(yearId)}` : ""}`,
      ),
  });

  const academic = useMemo(() => {
    const rows = rawResults.data ?? [];
    const totals: number[] = [];
    const dist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const r of rows) {
      const w = resolveWeights(r.class_id, r.subject_id, grading.defaults, grading.overrides);
      const total = weightedTotal(r.ca_mark, r.exam_mark, w);
      if (total == null) continue;
      totals.push(total);
      const g = gradeFor(total);
      if (g in dist) dist[g] += 1;
    }
    const averageResult = totals.length
      ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10
      : null;
    return { averageResult, gradeDistribution: dist, gradedCount: totals.length };
  }, [rawResults.data, grading.defaults, grading.overrides]);

  const c = core.data;
  const tuitionOutstanding = Math.max(0, (c?.tuitionDue ?? 0) - (c?.tuitionPaid ?? 0));
  const examExpected = (c?.activeStudents ?? 0) * examFee;
  const examOutstanding = Math.max(0, examExpected - (c?.examPaid ?? 0));

  return {
    ...c,
    ...academic,
    examFee,
    feesCollected: (c?.tuitionPaid ?? 0) + (c?.examPaid ?? 0),
    tuitionOutstanding,
    examOutstanding,
    outstanding: tuitionOutstanding + examOutstanding,
    attendanceRate:
      c && c.attendanceTotal ? Math.round((c.attendancePresent / c.attendanceTotal) * 100) : null,
    isLoading: core.isLoading || rawResults.isLoading || grading.isLoading,
  };
}
