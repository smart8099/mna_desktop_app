import { useMemo, useState } from "react";
import { Wallet } from "lucide-react";
import { Select } from "@/components/ui/Input";
import { SearchInput } from "@/components/ui/SearchInput";
import { Field } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { LoadingBlock, ErrorBlock } from "@/components/ui/State";
import { formatMoney } from "@/lib/money";
import { useDebounce } from "@/lib/useDebounce";
import { usePagination } from "@/lib/usePagination";
import { useCurrentYear, useNamedList, useSettings } from "@/features/settings/api";
import { balance } from "./logic";
import { useFeeSummary, type FeeRow } from "./api";
import { LedgerDrawer } from "./LedgerDrawer";

export function FeesPage() {
  const { data: settings } = useSettings();
  const { data: year } = useCurrentYear();
  const { data: classes = [] } = useNamedList("classes");
  const [classId, setClassId] = useState<number | "all">("all");
  const { data: rows, isLoading, error } = useFeeSummary(classId);
  const [selected, setSelected] = useState<FeeRow | null>(null);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 200);

  const currency = settings?.currency ?? "GH₵";

  const filtered = useMemo(() => {
    const needle = debouncedQ.trim().toLowerCase();
    if (!needle) return rows ?? [];
    return (rows ?? []).filter((r) =>
      [r.full_name, r.student_code, r.class_name]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(needle)),
    );
  }, [rows, debouncedQ]);

  const { page, setPage, pageSize, setPageSize, pageItems } = usePagination(filtered, {
    storageKey: "mna.fees.pageSize",
    resetKey: `${debouncedQ}|${classId}`,
  });

  const totals = useMemo(() => {
    const due = filtered.reduce((t, r) => t + r.due, 0);
    const paid = filtered.reduce((t, r) => t + r.paid, 0);
    return { due, paid, balance: balance(due, paid) };
  }, [filtered]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text">Daily tuition fees</h2>
        <p className="mt-1 text-sm text-text-muted">
          Charged per Present day: {formatMoney(Number(settings?.weekend_rate ?? 0), currency)} on
          weekends, {formatMoney(Number(settings?.vacation_rate ?? 0), currency)} on vacation Mon–Wed.
          {year ? ` Year ${year.hijri_label} AH.` : " No current academic year set — showing all records."}
        </p>
      </div>

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
        <SearchInput value={q} onChange={setQ} placeholder="Search student…" />
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
        <div className="rounded-xl border border-border bg-surface px-6 py-16 text-center">
          <Wallet className="mx-auto h-8 w-8 text-text-muted" />
          <p className="mt-3 text-sm text-text-muted">No active students.</p>
        </div>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-muted">
                    No students match “{debouncedQ}”.
                  </td>
                </tr>
              )}
              {pageItems.map((r) => {
                const bal = balance(r.due, r.paid);
                return (
                  <tr
                    key={r.id}
                    className="cursor-pointer hover:bg-surface-muted/50"
                    onClick={() => setSelected(r)}
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
                      {formatMoney(r.paid, currency)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-medium tabular-nums ${
                        bal > 0 ? "text-danger" : "text-primary"
                      }`}
                    >
                      {formatMoney(bal, currency)}
                    </td>
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

      <LedgerDrawer student={selected} currency={currency} onClose={() => setSelected(null)} />
    </div>
  );
}
