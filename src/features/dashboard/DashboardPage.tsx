import {
  CalendarCheck,
  GraduationCap,
  TrendingUp,
  Users,
  Wallet,
  WalletCards,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { BarList, type BarItem } from "@/components/ui/BarList";
import { LoadingBlock } from "@/components/ui/State";
import { formatMoney } from "@/lib/money";
import { useCurrentYear, useSettings } from "@/features/settings/api";
import { useDashboard } from "./api";

const GRADE_TONE = { A: "primary", B: "primary", C: "amber", D: "amber", F: "red" } as const;

export function DashboardPage() {
  const { data: year } = useCurrentYear();
  const { data: settings } = useSettings();
  const d = useDashboard(year?.id ?? null);
  const currency = settings?.currency ?? "GH₵";

  if (d.isLoading) {
    return <LoadingBlock />;
  }

  const enrollment: BarItem[] = (d.enrollmentByClass ?? []).map((c) => ({
    label: c.name,
    value: c.n,
    tone: "blue",
  }));

  const gradeBars: BarItem[] = (["A", "B", "C", "D", "F"] as const).map((g) => ({
    label: `Grade ${g}`,
    value: d.gradeDistribution?.[g] ?? 0,
    tone: GRADE_TONE[g],
  }));

  const attendanceBars: BarItem[] = (d.attendanceByClass ?? []).map((c) => {
    const pct = c.total ? Math.round((c.present / c.total) * 100) : 0;
    return {
      label: c.name,
      value: pct,
      display: c.total ? `${pct}%` : "—",
      tone: pct >= 80 ? "primary" : pct >= 50 ? "amber" : "red",
    };
  });

  const feeBars: BarItem[] = [
    { label: "Tuition collected", value: d.tuitionPaid ?? 0, display: formatMoney(d.tuitionPaid ?? 0, currency), tone: "primary" },
    { label: "Tuition outstanding", value: d.tuitionOutstanding ?? 0, display: formatMoney(d.tuitionOutstanding ?? 0, currency), tone: "red" },
    { label: "Exam collected", value: d.examPaid ?? 0, display: formatMoney(d.examPaid ?? 0, currency), tone: "primary" },
    { label: "Exam outstanding", value: d.examOutstanding ?? 0, display: formatMoney(d.examOutstanding ?? 0, currency), tone: "red" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-text">Dashboard</h2>
        <p className="mt-1 text-sm text-text-muted">
          {year
            ? `Overview for ${year.hijri_label} AH · ${year.gregorian_label}.`
            : "No current academic year set — showing all-time figures."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="Active students"
          value={d.activeStudents ?? 0}
          hint={`${d.totalStudents ?? 0} on the register`}
          icon={<Users className="h-4 w-4" />}
        />
        <StatTile
          label="Teachers"
          value={d.teachers ?? 0}
          icon={<GraduationCap className="h-4 w-4" />}
        />
        <StatTile
          label="Fees collected"
          value={formatMoney(d.feesCollected ?? 0, currency)}
          hint="Tuition + exam"
          tone="primary"
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatTile
          label="Outstanding"
          value={formatMoney(d.outstanding ?? 0, currency)}
          hint="Tuition + exam balance"
          tone={(d.outstanding ?? 0) > 0 ? "red" : "primary"}
          icon={<WalletCards className="h-4 w-4" />}
        />
        <StatTile
          label="Attendance rate"
          value={d.attendanceRate == null ? "—" : `${d.attendanceRate}%`}
          tone={d.attendanceRate == null ? "default" : d.attendanceRate >= 80 ? "primary" : d.attendanceRate >= 50 ? "amber" : "red"}
          icon={<CalendarCheck className="h-4 w-4" />}
        />
        <StatTile
          label="Average result"
          value={d.averageResult == null ? "—" : d.averageResult}
          hint={`${d.resultsEntered ?? 0} results entered`}
          tone="blue"
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Enrollment by class" description="Active students" />
          <CardBody>
            <BarList items={enrollment} empty="No classes yet." />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Grade distribution"
            description={`${d.gradedCount ?? 0} graded subject entries`}
          />
          <CardBody>
            <BarList items={gradeBars} empty="No results graded yet." />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Attendance by class" description="Present ÷ recorded days" />
          <CardBody>
            <BarList items={attendanceBars} max={100} empty="No attendance recorded yet." />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Fees" description="Collected vs outstanding" />
          <CardBody>
            <BarList items={feeBars} empty="No fee activity yet." />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
