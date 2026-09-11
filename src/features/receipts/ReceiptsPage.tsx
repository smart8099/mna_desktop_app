import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Printer, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { LoadingBlock, ErrorBlock, EmptyRow } from "@/components/ui/State";
import { cn } from "@/lib/cn";
import { savePdf } from "@/lib/pdf";
import { formatMoney } from "@/lib/money";
import { useDebounce } from "@/lib/useDebounce";
import { usePagination } from "@/lib/usePagination";
import { useSettings } from "@/features/settings/api";
import { balance } from "@/features/fees/logic";
import { useReceipts, type ReceiptRow } from "./api";
import { Receipt } from "./Receipt";

export function ReceiptsPage() {
  const { data: settings } = useSettings();
  const { data: rows, isLoading, error } = useReceipts();
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 200);
  const [selected, setSelected] = useState<ReceiptRow | null>(null);

  const currency = settings?.currency ?? "GH₵";
  const schoolName = settings?.school_name ?? "Madrasatul Nurul Absar";

  const filtered = useMemo(() => {
    const needle = debouncedQ.trim().toLowerCase();
    if (!needle) return rows ?? [];
    return (rows ?? []).filter((r) =>
      [r.full_name, r.student_code, r.receipt_no, r.class_name]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(needle)),
    );
  }, [rows, debouncedQ]);

  const { page, setPage, pageSize, setPageSize, pageItems } = usePagination(filtered, {
    storageKey: "mna.receipts.pageSize",
    resetKey: debouncedQ,
  });

  const printAreaRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  async function downloadPdf() {
    const node = printAreaRef.current?.querySelector<HTMLElement>(".receipt-doc");
    if (!node || !selected) return;
    try {
      setExporting(true);
      const saved = await savePdf(
        [node],
        `Receipt ${selected.receipt_no ?? selected.student_code} - ${selected.full_name}`.replace(
          /[/\\:]/g,
          "-",
        ),
      );
      if (saved) toast.success("PDF saved.");
    } catch (e) {
      toast.error(typeof e === "string" ? e : e instanceof Error ? e.message : "Could not export.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="no-print">
        <h2 className="text-xl font-semibold text-text">Examination receipts</h2>
        <p className="mt-1 text-sm text-text-muted">
          Every student with an examination payment. Select one to print or save as PDF.
        </p>
      </div>

      <div className="no-print flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search student, receipt no…" />
        {selected && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button onClick={downloadPdf} loading={exporting}>
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} />
      ) : !rows?.length ? (
        <div className="no-print rounded-xl border border-border bg-surface px-6 py-16 text-center">
          <ReceiptText className="mx-auto h-8 w-8 text-text-muted" />
          <p className="mt-3 text-sm text-text-muted">
            No examination payments recorded yet. Record one on the Exam Fees screen.
          </p>
        </div>
      ) : (
        <div className="no-print grid gap-4 lg:grid-cols-[minmax(320px,420px)_1fr]">
          <div className="overflow-hidden rounded-xl border border-border">
            <ul className="divide-y divide-border">
              {pageItems.length === 0 && <EmptyRow>No receipts match “{debouncedQ}”.</EmptyRow>}
              {pageItems.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelected(r)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-muted/60",
                      selected?.id === r.id && "bg-accent-soft",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-text">{r.full_name}</div>
                      <div className="text-xs text-text-muted">
                        {r.receipt_no ?? "—"} · {r.updated_at?.slice(0, 10)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="tabular-nums text-text">
                        {formatMoney(r.amount_paid, currency)}
                      </div>
                      {balance(r.amount_due, r.amount_paid) > 0 && (
                        <div className="text-xs text-danger">
                          {formatMoney(balance(r.amount_due, r.amount_paid), currency)} due
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
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

          <div className="rounded-xl border border-border bg-slate-200 p-4 dark:bg-slate-800">
            {selected ? (
              <Receipt row={selected} schoolName={schoolName} currency={currency} />
            ) : (
              <p className="py-16 text-center text-sm text-text-muted">
                Select a payment to preview its receipt.
              </p>
            )}
          </div>
        </div>
      )}

      <div
        id="print-area"
        ref={printAreaRef}
        className="pointer-events-none fixed left-[-10000px] top-0 print:static print:left-auto print:pointer-events-auto"
      >
        {selected && <Receipt row={selected} schoolName={schoolName} currency={currency} />}
      </div>
    </div>
  );
}
