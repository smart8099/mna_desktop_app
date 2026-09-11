import { Logo } from "@/components/ui/Logo";
import { formatMoney } from "@/lib/money";
import { balance } from "@/features/fees/logic";
import type { ReceiptRow } from "./api";

export function Receipt({
  row,
  schoolName,
  currency,
}: {
  row: ReceiptRow;
  schoolName: string;
  currency: string;
}) {
  const bal = balance(row.amount_due, row.amount_paid);

  return (
    <article className="receipt-doc mx-auto max-w-[640px] bg-white p-8 text-[13px] text-slate-900">
      <header className="flex items-center gap-4 border-b-2 border-slate-800 pb-3">
        <Logo className="h-14 w-14 shrink-0" />
        <div className="flex-1 text-center">
          <h1 className="text-lg font-bold uppercase tracking-wide">{schoolName}</h1>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-widest text-slate-600">
            Examination Fee Receipt
          </p>
        </div>
        <div className="h-14 w-14 shrink-0" />
      </header>

      <div className="mt-4 flex justify-between text-xs text-slate-500">
        <span>Receipt No: <span className="font-semibold text-slate-800">{row.receipt_no ?? "—"}</span></span>
        <span>Date: <span className="font-semibold text-slate-800">{row.updated_at?.slice(0, 10)}</span></span>
      </div>

      <table className="mt-4 w-full border-collapse">
        <tbody>
          <Row label="Received from" value={row.full_name} />
          <Row label="Student ID" value={row.student_code} />
          <Row label="Class" value={row.class_name ?? "—"} />
          <Row label="Academic year" value={`${row.hijri_label} AH · ${row.gregorian_label}`} />
          <Row label="Being payment for" value="Examination fee" />
          <Row label="Amount due" value={formatMoney(row.amount_due, currency)} />
          <Row label="Amount paid" value={formatMoney(row.amount_paid, currency)} bold />
          <Row label="Balance" value={formatMoney(bal, currency)} />
        </tbody>
      </table>

      <p className="mt-5 text-sm italic text-slate-700">Received with thanks for examination fees.</p>

      <footer className="mt-12 flex justify-between text-xs text-slate-600">
        <span>Administrator: ____________________</span>
        <span>Date: ____________</span>
      </footer>
    </article>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <tr className="border-b border-slate-200">
      <td className="py-2 pr-4 text-slate-500">{label}</td>
      <td className={`py-2 text-right ${bold ? "font-bold" : "font-medium"}`}>{value}</td>
    </tr>
  );
}
