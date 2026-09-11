import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { LoadingBlock, ErrorBlock, EmptyRow } from "@/components/ui/State";
import { suggestGregorianLabel, suggestHijriYear } from "@/lib/hijri";
import {
  useAcademicYears,
  useAddYear,
  useDeleteYear,
  useSetCurrentYear,
  useUpdateYear,
  type AcademicYear,
} from "./api";

type Draft = {
  id?: number;
  gregorian_label: string;
  hijri_label: string;
  start_date: string;
  end_date: string;
  make_current: boolean;
};

function emptyDraft(): Draft {
  return {
    gregorian_label: suggestGregorianLabel(),
    hijri_label: suggestHijriYear(),
    start_date: "",
    end_date: "",
    make_current: false,
  };
}

export function AcademicYearsSection() {
  const { data: years, isLoading, error } = useAcademicYears();
  const addYear = useAddYear();
  const updateYear = useUpdateYear();
  const setCurrent = useSetCurrentYear();
  const deleteYear = useDeleteYear();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AcademicYear | null>(null);

  const editing = draft?.id != null;

  async function save() {
    if (!draft) return;
    if (!draft.gregorian_label.trim() || !draft.hijri_label.trim()) {
      toast.error("Both the Gregorian and Hijri labels are required.");
      return;
    }
    try {
      if (editing) {
        await updateYear.mutateAsync({
          id: draft.id!,
          gregorian_label: draft.gregorian_label.trim(),
          hijri_label: draft.hijri_label.trim(),
          start_date: draft.start_date || null,
          end_date: draft.end_date || null,
        });
        toast.success("Academic year updated.");
      } else {
        await addYear.mutateAsync({
          gregorian_label: draft.gregorian_label.trim(),
          hijri_label: draft.hijri_label.trim(),
          start_date: draft.start_date || null,
          end_date: draft.end_date || null,
          make_current: draft.make_current,
        });
        toast.success("Academic year added.");
      }
      setDraft(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    }
  }

  return (
    <Card>
      <CardHeader
        title="Academic years"
        description="One period per year — labelled by its Hijri year. The current year drives new records."
        action={
          <Button size="sm" onClick={() => setDraft(emptyDraft())}>
            <Plus className="h-4 w-4" />
            Add year
          </Button>
        }
      />
      <CardBody className="p-0">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock error={error} />
        ) : !years?.length ? (
          <EmptyRow>No academic years yet. Add one to get started.</EmptyRow>
        ) : (
          <ul className="divide-y divide-border">
            {years.map((y) => (
              <li key={y.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text">{y.hijri_label} AH</span>
                    <span className="text-sm text-text-muted">· {y.gregorian_label}</span>
                    {y.is_current === 1 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-primary">
                        <CheckCircle2 className="h-3 w-3" />
                        Current
                      </span>
                    )}
                  </div>
                  {(y.start_date || y.end_date) && (
                    <p className="mt-0.5 text-xs text-text-muted">
                      {y.start_date || "—"} to {y.end_date || "—"}
                    </p>
                  )}
                </div>
                {y.is_current !== 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCurrent
                        .mutateAsync(y.id)
                        .then(() => toast.success(`${y.hijri_label} AH is now the current year.`))
                        .catch((e) => toast.error(String(e)))
                    }
                  >
                    Set current
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Edit"
                  onClick={() =>
                    setDraft({
                      id: y.id,
                      gregorian_label: y.gregorian_label,
                      hijri_label: y.hijri_label,
                      start_date: y.start_date ?? "",
                      end_date: y.end_date ?? "",
                      make_current: false,
                    })
                  }
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete"
                  onClick={() => setConfirmDelete(y)}
                >
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>

      <Dialog
        open={draft != null}
        onClose={() => setDraft(null)}
        title={editing ? "Edit academic year" : "Add academic year"}
        footer={
          <>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={addYear.isPending || updateYear.isPending}>
              {editing ? "Save" : "Add year"}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Hijri year" hint="e.g. 1448">
                <Input
                  value={draft.hijri_label}
                  onChange={(e) => setDraft({ ...draft, hijri_label: e.target.value })}
                />
              </Field>
              <Field label="Gregorian label" hint="e.g. 2026/2027">
                <Input
                  value={draft.gregorian_label}
                  onChange={(e) => setDraft({ ...draft, gregorian_label: e.target.value })}
                />
              </Field>
              <Field label="Start date">
                <Input
                  type="date"
                  value={draft.start_date}
                  onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
                />
              </Field>
              <Field label="End date">
                <Input
                  type="date"
                  value={draft.end_date}
                  onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
                />
              </Field>
            </div>
            {!editing && (
              <label className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--color-primary)]"
                  checked={draft.make_current}
                  onChange={(e) => setDraft({ ...draft, make_current: e.target.checked })}
                />
                Make this the current academic year
              </label>
            )}
          </div>
        )}
      </Dialog>

      <Dialog
        open={confirmDelete != null}
        onClose={() => setConfirmDelete(null)}
        title="Delete academic year?"
        description={
          confirmDelete
            ? `This removes ${confirmDelete.hijri_label} AH and its calendar periods. Records linked to it are not deleted but lose their year link.`
            : ""
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleteYear.isPending}
              onClick={async () => {
                if (!confirmDelete) return;
                try {
                  await deleteYear.mutateAsync(confirmDelete.id);
                  toast.success("Academic year deleted.");
                  setConfirmDelete(null);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not delete.");
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      />
    </Card>
  );
}
