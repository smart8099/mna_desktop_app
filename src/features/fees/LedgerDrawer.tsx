import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { LoadingBlock } from "@/components/ui/State";
import { useIsAdmin } from "@/features/auth/AuthContext";
import { formatMoney, parseMoney } from "@/lib/money";
import { todayISO } from "@/lib/format";
import { balance, dayName } from "./logic";
import { useDeletePayment, useRecordPayment, useStudentLedger, type FeeRow } from "./api";

export function LedgerDrawer({
  student,
  currency,
  onClose,
}: {
  student: FeeRow | null;
  currency: string;
  onClose: () => void;
}) {
  const isAdmin = useIsAdmin();
  const { data, isLoading } = useStudentLedger(student?.id ?? null);
  const record = useRecordPayment();
  const removePayment = useDeletePayment();

  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");

  async function submit() {
    if (!student) return;
    const value = parseMoney(amount);
    if (!value || value <= 0) {
      toast.error("Enter a payment amount greater than zero.");
      return;
    }
    try {
      const receipt = await record.mutateAsync({
        studentId: student.id,
        amount: value,
        date,
        note: note.trim() || null,
      });
      toast.success(`Payment recorded — receipt ${receipt}.`);
      setAmount("");
      setNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the payment.");
    }
  }

  const due = data?.due ?? 0;
  const paid = data?.paid ?? 0;

  return (
    <Drawer
      open={student != null}
      onClose={onClose}
      title={student ? student.full_name : ""}
      description={student ? `${student.student_code} · daily tuition` : ""}
      width="max-w-2xl"
    >
      {isLoading || !data ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-3">
            {[
              ["Due", due, "text-text"],
              ["Paid", paid, "text-text"],
              ["Balance", balance(due, paid), balance(due, paid) > 0 ? "text-danger" : "text-primary"],
            ].map(([label, value, cls]) => (
              <div key={label as string} className="rounded-lg border border-border bg-surface-muted p-3">
                <div className="text-xs text-text-muted">{label as string}</div>
                <div className={`mt-1 text-sm font-semibold ${cls as string}`}>
                  {formatMoney(value as number, currency)}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold text-text">Record a payment</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr]">
              <Field label={`Amount (${currency})`}>
                <Input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Date">
                <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
            <Field label="Note (optional)" className="mt-3">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="mt-3 flex justify-end">
              <Button onClick={submit} loading={record.isPending}>
                Record payment
              </Button>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-text">
              Payments ({data.payments.length})
            </h3>
            {data.payments.length === 0 ? (
              <p className="text-sm text-text-muted">No payments recorded yet.</p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {data.payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-text">{formatMoney(p.amount, currency)}</div>
                      <div className="text-xs text-text-muted">
                        {p.date}
                        {p.receipt_no ? ` · ${p.receipt_no}` : ""}
                        {p.note ? ` · ${p.note}` : ""}
                      </div>
                    </div>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete payment"
                        onClick={() =>
                          removePayment
                            .mutateAsync(p.id)
                            .then(() => toast.success("Payment removed."))
                            .catch((e) => toast.error(String(e)))
                        }
                      >
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-text">
              Chargeable days ({data.charges.length})
            </h3>
            {data.charges.length === 0 ? (
              <p className="text-sm text-text-muted">
                No chargeable Present days yet (weekends, or vacation Mon–Wed).
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    {data.charges.map((c) => (
                      <tr key={c.date}>
                        <td className="px-4 py-2 text-text">{c.date}</td>
                        <td className="px-4 py-2 text-text-muted">{dayName(c.dow)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-text">
                          {formatMoney(c.rate, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
