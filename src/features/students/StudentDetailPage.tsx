import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { ArrowLeft, CalendarCheck, FileText, Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { LoadingBlock } from "@/components/ui/State";
import { YearSelect } from "@/components/ui/YearSelect";
import { useIsAdmin } from "@/features/auth/AuthContext";
import { cn } from "@/lib/cn";
import { formatMoney, round2 } from "@/lib/money";
import { useNamedList, useSettings, useYearFilter } from "@/features/settings/api";
import { balance, paymentStatus, PAYMENT_STATUS_LABEL } from "@/features/fees/logic";
import { useStudentLedger } from "@/features/fees/api";
import { useClassGradebook } from "@/features/report-cards/api";
import {
  useApplyExamFeeCredit,
  useStudent,
  useStudentAttendance,
  useStudentEnrollments,
  useStudentExamFee,
  useStudentYearBalances,
} from "./api";
import { ageFromDob, initials, nextYearAfter } from "./logic";
import { StudentFormDrawer } from "./StudentFormDrawer";

export function StudentDetailPage() {
  const isAdmin = useIsAdmin();
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const navigate = useNavigate();

  const { data: student, isLoading } = useStudent(Number.isFinite(id) ? id : null);
  const { years, year, yearId, setYearId, isCurrentYear } = useYearFilter();
  const { data: settings } = useSettings();
  const { data: classes = [] } = useNamedList("classes");

  const attendance = useStudentAttendance(id, yearId);
  const enrollments = useStudentEnrollments(id);
  const ledger = useStudentLedger(Number.isFinite(id) ? id : null, yearId);
  const examFee = useStudentExamFee(id, yearId);
  // This page has its own attendance query for the one student being viewed,
  // so skip fetching every classmate's attendance/remarks just for ranking.
  const gb = useClassGradebook(student?.class_id ?? null, yearId, {
    includeAttendance: false,
  });
  const perf = gb.gradebook.find((g) => g.student_id === id) ?? null;
  const yearBalances = useStudentYearBalances(id);
  const applyCredit = useApplyExamFeeCredit();

  const [editOpen, setEditOpen] = useState(false);
  const [creditConfirm, setCreditConfirm] = useState<{
    fromYearId: number;
    fromYearLabel: string;
    toYear: { id: number; hijri_label: string; gregorian_label: string };
    amount: number;
  } | null>(null);

  const currency = settings?.currency ?? "GH₵";

  if (isLoading) return <LoadingBlock />;
  if (!student) {
    return (
      <div className="rounded-xl border border-border bg-surface px-6 py-16 text-center">
        <p className="text-sm text-text-muted">That student could not be found.</p>
        <Link to="/students" className="mt-3 inline-block text-sm text-primary hover:underline">
          Back to students
        </Link>
      </div>
    );
  }

  const age = ageFromDob(student.dob);
  const attTotal = (attendance.data?.present ?? 0) + (attendance.data?.absent ?? 0);
  const attPct = attTotal ? Math.round(((attendance.data?.present ?? 0) / attTotal) * 100) : null;
  const examDue = Number(settings?.exam_fee ?? 0);
  const examPaid = examFee.data?.amount_paid ?? 0;
  const examStatus = paymentStatus(examDue, examPaid);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/students"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" />
          Students
        </Link>
        <div className="flex items-center gap-2">
          {years.length > 0 && (
            <YearSelect years={years} value={yearId} onChange={setYearId} className="h-9 w-auto text-sm" />
          )}
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>

      {!isCurrentYear && year && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-warning">
          Viewing {year.hijri_label} AH — not the current academic year. Attendance, fees and
          results below are all scoped to this year.
        </div>
      )}

      {/* header */}
      <Card>
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-surface-muted text-2xl font-semibold text-text-muted">
            {student.photo_path ? (
              <img
                src={convertFileSrc(student.photo_path)}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              initials(student.full_name)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-text">{student.full_name}</h2>
              <StatusBadge status={student.status} />
            </div>
            <p className="mt-0.5 text-sm text-text-muted">
              {student.student_code} · {student.class_name ?? "No class"}
            </p>
          </div>
        </CardBody>
        <div className="grid grid-cols-2 gap-px border-t border-border bg-border text-sm sm:grid-cols-3 lg:grid-cols-4">
          <Fact label="Student ID" value={student.student_code} />
          <Fact label="Admission no." value={student.admission_no ?? "—"} />
          <Fact label="Gender" value={student.gender ?? "—"} />
          <Fact label="Date of birth" value={student.dob ?? "—"} sub={age != null ? `${age} yrs` : undefined} />
          <Fact label="Admitted" value={student.date_admitted ?? "—"} />
          <Fact label="Class" value={student.class_name ?? "—"} />
          <Fact label="Academic year" value={year ? `${year.hijri_label} AH` : "—"} />
          <Fact label="Status" value={student.status} />
        </div>
      </Card>

      {/* balances across every year — so a debt carried from a past year, or
          into a future one, is visible without switching the year filter */}
      <Card>
        <CardHeader
          title="Balances across years"
          description="Tuition and examination fee balances for every academic year on record."
        />
        <CardBody className="p-0">
          {yearBalances.isLoading ? (
            <LoadingBlock />
          ) : yearBalances.balances.length === 0 ? (
            <p className="px-5 py-6 text-sm text-text-muted">No fee activity recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {yearBalances.balances.map((b) => {
                const nextYear = nextYearAfter(years, b.year_id);
                const hasCredit = b.exam_balance < 0;
                return (
                  <li
                    key={b.year_id}
                    className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 text-sm"
                  >
                    <span className="flex min-w-[9rem] items-center gap-2 font-medium text-text">
                      {b.hijri_label} AH
                      {b.is_current === 1 && <Badge tone="green">Current</Badge>}
                    </span>
                    <BalanceStat label="Tuition" amount={b.tuition_balance} currency={currency} />
                    <BalanceStat label="Exam fee" amount={b.exam_balance} currency={currency} />
                    {hasCredit && isAdmin && nextYear && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto"
                        onClick={() =>
                          setCreditConfirm({
                            fromYearId: b.year_id,
                            fromYearLabel: `${b.hijri_label} AH`,
                            toYear: nextYear,
                            amount: round2(-b.exam_balance),
                          })
                        }
                      >
                        Apply {formatMoney(-b.exam_balance, currency)} credit to{" "}
                        {nextYear.hijri_label} AH
                      </Button>
                    )}
                    {hasCredit && isAdmin && !nextYear && (
                      <span className="ml-auto text-xs text-text-muted">
                        No later academic year to apply this credit to yet.
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* contact */}
        <Card>
          <CardHeader title="Contact & guardian" />
          <CardBody className="space-y-2 text-sm">
            <Row label="Phone" value={student.contact} />
            <Row label="Parent / guardian" value={student.guardian} />
            <Row label="Emergency contact" value={student.emergency_contact} />
            <Row label="Address" value={student.address} />
            {student.notes && <Row label="Notes" value={student.notes} />}
          </CardBody>
        </Card>

        {/* attendance */}
        <Card>
          <CardHeader
            title="Attendance"
            description={year ? `${year.hijri_label} AH` : "All records"}
          />
          <CardBody>
            {attendance.isLoading ? (
              <LoadingBlock />
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Present" value={String(attendance.data?.present ?? 0)} />
                  <Stat label="Absent" value={String(attendance.data?.absent ?? 0)} />
                  <Stat
                    label="Rate"
                    value={attPct == null ? "—" : `${attPct}%`}
                    tone={attPct == null ? "muted" : attPct >= 80 ? "green" : attPct >= 50 ? "amber" : "red"}
                  />
                </div>
                {attendance.data?.recent.length ? (
                  <div className="mt-4">
                    <p className="mb-1.5 text-xs text-text-muted">Recent days</p>
                    <div className="flex flex-wrap gap-1.5">
                      {attendance.data.recent.map((r) => (
                        <span
                          key={r.date}
                          title={`${r.date} — ${r.status}`}
                          className={cn(
                            "h-4 w-4 rounded",
                            r.status === "Present" ? "bg-primary" : "bg-danger",
                          )}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-text-muted">No attendance recorded yet.</p>
                )}
              </>
            )}
          </CardBody>
        </Card>

        {/* academic performance — full width */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Academic performance"
            description={year ? `${year.hijri_label} AH` : "No academic year set"}
            action={
              student.class_id && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigate(`/report-cards?class=${student.class_id}&student=${student.id}`)
                  }
                >
                  <FileText className="h-4 w-4" />
                  Report card
                </Button>
              )
            }
          />
          <CardBody className="p-0">
            {gb.isLoading ? (
              <LoadingBlock />
            ) : !perf || perf.average == null ? (
              <p className="px-5 py-6 text-sm text-text-muted">
                No results entered for this student{year ? ` in ${year.hijri_label} AH` : ""}.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="border-b border-border bg-surface-muted text-left text-xs text-text-muted">
                    <tr>
                      <th className="px-5 py-2 font-medium">Subject</th>
                      <th className="px-3 py-2 text-right font-medium">CA</th>
                      <th className="px-3 py-2 text-right font-medium">Exam</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                      <th className="px-3 py-2 text-center font-medium">Grade</th>
                      <th className="px-3 py-2 text-center font-medium">Position</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {perf.cells.map((c) => (
                      <tr key={c.subject_id}>
                        <td className="px-5 py-2 font-medium text-text">{c.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-text-muted">{c.ca ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-text-muted">{c.exam ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-text">{c.total ?? "—"}</td>
                        <td className="px-3 py-2 text-center font-semibold text-text">{c.grade}</td>
                        <td className="px-3 py-2 text-center tabular-nums text-text-muted">{c.position ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-surface-muted font-medium">
                      <td className="px-5 py-2.5 text-text">Overall</td>
                      <td colSpan={2} />
                      <td className="px-3 py-2.5 text-right tabular-nums text-text">{perf.average}</td>
                      <td className="px-3 py-2.5 text-center font-semibold text-text">{perf.overall_grade}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-text">
                        {perf.overall_position ?? "—"} / {gb.gradebook.length}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        {/* tuition fees */}
        <Card>
          <CardHeader title="Daily tuition fees" description={year ? `${year.hijri_label} AH` : "All records"} />
          <CardBody>
            {ledger.isLoading || !ledger.data ? (
              <LoadingBlock />
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Due" value={formatMoney(ledger.data.due, currency)} />
                  <Stat label="Paid" value={formatMoney(ledger.data.paid, currency)} />
                  <Stat
                    label="Balance"
                    value={formatMoney(balance(ledger.data.due, ledger.data.paid), currency)}
                    tone={balance(ledger.data.due, ledger.data.paid) > 0 ? "red" : "green"}
                  />
                </div>
                {ledger.data.payments.length > 0 && (
                  <ul className="mt-4 space-y-1 text-sm">
                    {ledger.data.payments.slice(0, 5).map((p) => (
                      <li key={p.id} className="flex justify-between text-text-muted">
                        <span>{p.date}{p.receipt_no ? ` · ${p.receipt_no}` : ""}</span>
                        <span className="tabular-nums text-text">{formatMoney(p.amount, currency)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </CardBody>
        </Card>

        {/* exam fees */}
        <Card>
          <CardHeader title="Examination fees" description={year ? `${year.hijri_label} AH` : "No academic year set"} />
          <CardBody>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Due" value={formatMoney(examDue, currency)} />
              <Stat label="Paid" value={formatMoney(examPaid, currency)} />
              <Stat
                label="Balance"
                value={formatMoney(balance(examDue, examPaid), currency)}
                tone={balance(examDue, examPaid) > 0 ? "red" : "green"}
              />
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <Badge tone={examStatus === "paid" ? "green" : examStatus === "partial" ? "amber" : "red"}>
                {PAYMENT_STATUS_LABEL[examStatus]}
              </Badge>
              {examFee.data?.receipt_no && (
                <span className="text-text-muted">Receipt {examFee.data.receipt_no}</span>
              )}
            </div>
          </CardBody>
        </Card>

        {/* enrollment history */}
        <Card className="lg:col-span-2">
          <CardHeader title="Enrollment history" />
          <CardBody className="p-0">
            {enrollments.isLoading ? (
              <LoadingBlock />
            ) : !enrollments.data?.length ? (
              <p className="px-5 py-6 text-sm text-text-muted">
                No enrollment records yet — these are added when a student is created or promoted
                within an academic year.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {enrollments.data.map((e) => (
                  <li
                    key={`${e.hijri_label}-${e.class_name}`}
                    className="flex items-center gap-3 px-5 py-2.5 text-sm"
                  >
                    <CalendarCheck className="h-4 w-4 shrink-0 text-text-muted" />
                    <span className="font-medium text-text">
                      {e.hijri_label} AH · {e.gregorian_label}
                    </span>
                    {e.is_current === 1 && <Badge tone="green">Current</Badge>}
                    <span className="ml-auto text-text-muted">{e.class_name}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <StudentFormDrawer
        open={editOpen}
        student={student}
        classes={classes}
        suggestedAdmissionNo=""
        onClose={() => setEditOpen(false)}
      />

      <Dialog
        open={creditConfirm != null}
        onClose={() => setCreditConfirm(null)}
        title="Apply credit to the next year?"
        description={
          creditConfirm
            ? `${formatMoney(creditConfirm.amount, currency)} overpaid in ${creditConfirm.fromYearLabel} will move to ${creditConfirm.toYear.hijri_label} AH · ${creditConfirm.toYear.gregorian_label}. This is recorded as a note on both years' exam fee records.`
            : ""
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setCreditConfirm(null)}>
              Cancel
            </Button>
            <Button
              loading={applyCredit.isPending}
              onClick={async () => {
                if (!creditConfirm) return;
                try {
                  await applyCredit.mutateAsync({
                    studentId: id,
                    fromYearId: creditConfirm.fromYearId,
                    fromYearLabel: creditConfirm.fromYearLabel,
                    toYearId: creditConfirm.toYear.id,
                    toYearLabel: `${creditConfirm.toYear.hijri_label} AH`,
                    amount: creditConfirm.amount,
                    standardFee: examDue,
                    noteAmount: formatMoney(creditConfirm.amount, currency),
                  });
                  toast.success("Credit applied.");
                  setCreditConfirm(null);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not apply the credit.");
                }
              }}
            >
              Apply credit
            </Button>
          </>
        }
      />
    </div>
  );
}

function BalanceStat({
  label,
  amount,
  currency,
}: {
  label: string;
  amount: number;
  currency: string;
}) {
  const tone = amount > 0 ? "text-danger" : amount < 0 ? "text-primary" : "text-text-muted";
  const suffix = amount > 0 ? "owing" : amount < 0 ? "credit" : "settled";
  return (
    <span className="text-text-muted">
      {label}:{" "}
      <span className={cn("font-medium", tone)}>
        {formatMoney(Math.abs(amount), currency)} {suffix}
      </span>
    </span>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-0.5 font-medium text-text">
        {value}
        {sub && <span className="ml-1 text-xs font-normal text-text-muted">({sub})</span>}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-3">
      <span className="w-36 shrink-0 text-text-muted">{label}</span>
      <span className="text-text">{value || "—"}</span>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "muted" | "green" | "amber" | "red";
}) {
  const toneCls = {
    default: "text-text",
    muted: "text-text-muted",
    green: "text-primary",
    amber: "text-warning",
    red: "text-danger",
  }[tone];
  return (
    <div className="rounded-lg border border-border bg-surface-muted p-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className={cn("mt-0.5 text-sm font-semibold tabular-nums", toneCls)}>{value}</div>
    </div>
  );
}
