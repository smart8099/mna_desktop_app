import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select, Input, Textarea } from "@/components/ui/Input";
import { SearchInput } from "@/components/ui/SearchInput";
import { Field } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { Drawer } from "@/components/ui/Drawer";
import { LoadingBlock, ErrorBlock, EmptyRow } from "@/components/ui/State";
import { YearSelect } from "@/components/ui/YearSelect";
import { formatMoney, parseMoney } from "@/lib/money";
import { useDebounce } from "@/lib/useDebounce";
import { usePagination } from "@/lib/usePagination";
import {
  balance,
  paymentStatus,
  PAYMENT_STATUS_LABEL,
  type PaymentStatus,
} from "@/features/fees/logic";
import { useNamedList, useSettings, useYearFilter } from "@/features/settings/api";
import { useExamFees, useSaveExamFee, type ExamFeeRow } from "./api";

/**
 * The amount every student owes for the current year is the standard fee set in
 * Settings — it is not editable per student, so changing it there updates the
 * whole screen. A student's stored `amount_due` is only a materialised copy.
 */
function effectiveDue(_row: ExamFeeRow, standardFee: number): number {
  return standardFee;
}

export function ExamFeesPage() {
  const { data: settings } = useSettings();
  const { years, year, yearId, setYearId, isCurrentYear } = useYearFilter();
  const { data: classes = [] } = useNamedList("classes");
  const [classId, setClassId] = useState<number | "all">("all");
  const { data: rows, isLoading, error } = useExamFees(classId, yearId);

  const [editing, setEditing] = useState<ExamFeeRow | null>(null);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 200);
  const [payFilter, setPayFilter] = useState<PaymentStatus | "all">("all");

  const currency = settings?.currency ?? "GH₵";
  const standardFee = Number(settings?.exam_fee ?? 0);

  const withDue = useMemo(
    () => (rows ?? []).map((r) => ({ ...r, due: effectiveDue(r, standardFee) })),
    [rows, standardFee],
  );

  const filtered = useMemo(() => {
    const needle = debouncedQ.trim().toLowerCase();
    return withDue.filter((r) => {
      if (payFilter !== "all" && paymentStatus(r.due, r.amount_paid) !== payFilter) return false;
      if (!needle) return true;
      return [r.full_name, r.student_code, r.class_name, r.receipt_no]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(needle));
    });
  }, [withDue, debouncedQ, payFilter]);

  const { page, setPage, pageSize, setPageSize, pageItems } = usePagination(filtered, {
    storageKey: "mna.examfees.pageSize",
    resetKey: `${debouncedQ}|${classId}|${payFilter}`,
  });

  const totals = useMemo(() => {
    const due = filtered.reduce((t, r) => t + r.due, 0);
    const paid = filtered.reduce((t, r) => t + r.amount_paid, 0);
    return { due, paid, balance: balance(due, paid) };
  }, [filtered]);

  if (!year) {
    return (
      <div className="rounded-xl border border-border bg-surface px-6 py-16 text-center">
        <ReceiptText className="mx-auto h-8 w-8 text-text-muted" />
        <p className="mt-3 text-sm text-text-muted">
          Set a current academic year in Settings to record examination fees.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-text">Examination fees</h2>
          <p className="mt-1 text-sm text-text-muted">
            {year.hijri_label} AH · {year.gregorian_label}. Standard fee{" "}
            <span className="font-medium text-text">{formatMoney(standardFee, currency)}</span> — change
            it in Settings → Fees &amp; Grading.
          </p>
        </div>
        {years.length > 0 && <YearSelect years={years} value={yearId} onChange={setYearId} />}
      </div>

      {!isCurrentYear && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-warning">
          Viewing {year.hijri_label} AH — not the current academic year. Records are read-only;
          switch back to the current year to log payments.
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Class" className="w-48">
          <Select
            value={classId}
            onChange={(e) => setClassId(e.target.value === "all" ? "all" : Number(e.target.value))}
          >
            <option value="all">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Payment" className="w-40">
          <Select
            value={payFilter}
            onChange={(e) => setPayFilter(e.target.value as PaymentStatus | "all")}
          >
            <option value="all">All statuses</option>
            <option value="paid">Paid in full</option>
            <option value="partial">Partly paid</option>
            <option value="unpaid">Unpaid</option>
          </Select>
        </Field>
        <SearchInput value={q} onChange={setQ} placeholder="Search student, receipt…" />
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Badge tone="muted">Due {formatMoney(totals.due, currency)}</Badge>
        <Badge tone="green">Paid {formatMoney(totals.paid, currency)}</Badge>
        <Badge tone={totals.balance > 0 ? "red" : "green"}>
          Balance {formatMoney(totals.balance, currency)}
        </Badge>
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} />
      ) : !rows?.length ? (
        <EmptyRow>No active students.</EmptyRow>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted text-left text-xs text-text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Student</th>
                <th className="px-4 py-2.5 font-medium">Class</th>
                <th className="px-4 py-2.5 text-right font-medium">Due</th>
                <th className="px-4 py-2.5 text-right font-medium">Paid</th>
                <th className="px-4 py-2.5 text-right font-medium">Balance</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-text-muted">
                    No students match the current filters.
                  </td>
                </tr>
              )}
              {pageItems.map((r) => {
                const bal = balance(r.due, r.amount_paid);
                const status = paymentStatus(r.due, r.amount_paid);
                return (
                  <tr
                    key={r.student_id}
                    className="cursor-pointer hover:bg-surface-muted/50"
                    onClick={() => setEditing(r)}
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-text">{r.full_name}</div>
                      <div className="text-xs text-text-muted">{r.student_code}</div>
                    </td>
                    <td className="px-4 py-2.5 text-text-muted">{r.class_name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-muted">
                      {formatMoney(r.due, currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-muted">
                      {formatMoney(r.amount_paid, currency)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-medium tabular-nums ${
                        bal > 0 ? "text-danger" : "text-primary"
                      }`}
                    >
                      {formatMoney(bal, currency)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        tone={status === "paid" ? "green" : status === "partial" ? "amber" : "red"}
                      >
                        {PAYMENT_STATUS_LABEL[status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-text-muted">{r.receipt_no ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t border-border px-4 py-2.5">
            <Pagination
              page={page}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        </div>
      )}

      <ExamFeeDrawer
        row={editing}
        currency={currency}
        standardFee={standardFee}
        readOnly={!isCurrentYear}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function ExamFeeDrawer({
  row,
  currency,
  standardFee,
  readOnly = false,
  onClose,
}: {
  row: ExamFeeRow | null;
  currency: string;
  standardFee: number;
  readOnly?: boolean;
  onClose: () => void;
}) {
  const save = useSaveExamFee();
  const [paid, setPaid] = useState("");
  const [notes, setNotes] = useState("");

  const due = row ? effectiveDue(row, standardFee) : 0;

  useEffect(() => {
    if (row) {
      setPaid(String(row.amount_paid || ""));
      setNotes(row.notes ?? "");
    }
  }, [row]);

  async function submit() {
    if (!row) return;
    const paidVal = parseMoney(paid) ?? 0;
    if (paidVal < 0) {
      toast.error("Amount paid cannot be negative.");
      return;
    }
    try {
      await save.mutateAsync({
        studentId: row.student_id,
        amount_due: due,
        amount_paid: paidVal,
        notes: notes.trim() || null,
        receipt_no: row.receipt_no,
      });
      toast.success("Examination fee saved.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    }
  }

  return (
    <Drawer
      open={row != null}
      onClose={onClose}
      title={row ? row.full_name : ""}
      description={row ? `${row.student_code} · examination fee` : ""}
      footer={
        readOnly ? (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} loading={save.isPending}>
              Save
            </Button>
          </>
        )
      }
    >
      {row && (
        <div className="space-y-4">
          {readOnly && (
            <p className="rounded-lg bg-warning/10 p-3 text-xs text-warning">
              This is a past academic year — viewing only. Switch to the current year to record a
              payment.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Amount due (${currency})`} hint="Set by the standard fee in Settings.">
              <Input
                readOnly
                tabIndex={-1}
                value={formatMoney(due, currency)}
                className="cursor-default bg-surface-muted text-text-muted"
              />
            </Field>
            <Field label={`Amount paid (${currency})`}>
              <Input
                inputMode="decimal"
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
                readOnly={readOnly}
                tabIndex={readOnly ? -1 : undefined}
                className={readOnly ? "cursor-default bg-surface-muted text-text-muted" : undefined}
              />
            </Field>
          </div>
          {due === 0 && (
            <p className="rounded-lg bg-warning/10 p-3 text-xs text-warning">
              No standard examination fee is set. Add one in Settings → Fees &amp; Grading.
            </p>
          )}
          <div className="rounded-lg bg-surface-muted p-3 text-sm text-text-muted">
            Balance:{" "}
            <span className="font-medium text-text">
              {formatMoney(balance(due, parseMoney(paid) ?? 0), currency)}
            </span>
            {row.receipt_no && ` · receipt ${row.receipt_no}`}
          </div>
          <Field label="Notes (optional)">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              readOnly={readOnly}
              className={readOnly ? "cursor-default bg-surface-muted text-text-muted" : undefined}
            />
          </Field>
        </div>
      )}
    </Drawer>
  );
}
