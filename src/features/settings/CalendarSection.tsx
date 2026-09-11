import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, Select } from "@/components/ui/Input";
import { LoadingBlock, ErrorBlock, EmptyRow } from "@/components/ui/State";
import { cn } from "@/lib/cn";
import {
  useAcademicYears,
  useAddCalendarPeriod,
  useCalendar,
  useCurrentYear,
  useDeleteCalendarPeriod,
} from "./api";

export function CalendarSection() {
  const { data: years } = useAcademicYears();
  const { data: current } = useCurrentYear();
  const [yearId, setYearId] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (yearId == null && current) setYearId(current.id);
  }, [current, yearId]);

  const { data: periods, isLoading, error } = useCalendar(yearId);
  const addPeriod = useAddCalendarPeriod();
  const deletePeriod = useDeleteCalendarPeriod();

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [type, setType] = useState<"vacation" | "term">("vacation");
  const [note, setNote] = useState("");

  async function add() {
    if (!yearId) {
      toast.error("Add an academic year first.");
      return;
    }
    if (!start || !end) {
      toast.error("Start and end dates are required.");
      return;
    }
    if (end < start) {
      toast.error("End date cannot be before the start date.");
      return;
    }
    try {
      await addPeriod.mutateAsync({
        year_id: yearId,
        start_date: start,
        end_date: end,
        type,
        note: note.trim() || null,
      });
      setStart("");
      setEnd("");
      setNote("");
      toast.success("Period added.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add period.");
    }
  }

  return (
    <Card>
      <CardHeader
        title="Academic calendar"
        description="Mark vacation periods. Mon–Wed tuition is only charged on days that fall inside a vacation period."
        action={
          <Select
            className="h-8 w-auto text-xs"
            value={yearId ?? ""}
            onChange={(e) => setYearId(Number(e.target.value) || undefined)}
          >
            <option value="">Select year…</option>
            {years?.map((y) => (
              <option key={y.id} value={y.id}>
                {y.hijri_label} AH · {y.gregorian_label}
              </option>
            ))}
          </Select>
        }
      />
      <CardBody className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <Field label="Start date">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="End date">
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value as "vacation" | "term")}>
              <option value="vacation">Vacation</option>
              <option value="term">Term</option>
            </Select>
          </Field>
          <Button onClick={add} loading={addPeriod.isPending} className="sm:mb-0">
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
        <Field label="Note (optional)">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Ramadan break"
          />
        </Field>

        <div className="overflow-hidden rounded-lg border border-border">
          {isLoading ? (
            <LoadingBlock />
          ) : error ? (
            <ErrorBlock error={error} />
          ) : !periods?.length ? (
            <EmptyRow>No calendar periods for this year yet.</EmptyRow>
          ) : (
            <ul className="divide-y divide-border">
              {periods.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                      p.type === "vacation"
                        ? "bg-warning/15 text-warning"
                        : "bg-accent-soft text-primary",
                    )}
                  >
                    {p.type}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-text">
                      {p.start_date} → {p.end_date}
                    </div>
                    {p.note && <div className="text-xs text-text-muted">{p.note}</div>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete"
                    onClick={() =>
                      deletePeriod
                        .mutateAsync(p.id)
                        .then(() => toast.success("Period removed."))
                        .catch((e) => toast.error(String(e)))
                    }
                  >
                    <Trash2 className="h-4 w-4 text-danger" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
