import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, Select } from "@/components/ui/Input";
import { LoadingBlock, ErrorBlock, EmptyRow } from "@/components/ui/State";
import { weightToPct, pctToWeight } from "@/lib/format";
import {
  useNamedList,
  useDeleteWeightOverride,
  useUpsertWeightOverride,
  useWeightOverrides,
} from "./api";

export function WeightOverridesSection() {
  const { data: overrides, isLoading, error } = useWeightOverrides();
  const { data: classes = [] } = useNamedList("classes");
  const { data: subjects = [] } = useNamedList("subjects");
  const upsert = useUpsertWeightOverride();
  const remove = useDeleteWeightOverride();

  const [scope, setScope] = useState<"class" | "subject">("class");
  const [refId, setRefId] = useState<number | "">("");
  const [caPct, setCaPct] = useState("30");
  const [examPct, setExamPct] = useState("70");

  const nameFor = (o: { scope: string; ref_id: number }) =>
    (o.scope === "class" ? classes : subjects).find((x) => x.id === o.ref_id)?.name ??
    `#${o.ref_id}`;

  async function add() {
    if (refId === "") {
      toast.error(`Choose a ${scope}.`);
      return;
    }
    const ca = Number(caPct);
    const exam = Number(examPct);
    if (ca + exam !== 100) {
      toast.error("CA % and Exam % must add up to 100.");
      return;
    }
    try {
      await upsert.mutateAsync({
        scope,
        ref_id: Number(refId),
        ca_weight: pctToWeight(ca),
        exam_weight: pctToWeight(exam),
      });
      setRefId("");
      toast.success("Override saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    }
  }

  const targets = scope === "class" ? classes : subjects;

  return (
    <Card>
      <CardHeader
        title="Grading weight overrides"
        description="A subject override wins over a class override, which wins over the global CA / Exam split."
      />
      <CardBody className="space-y-4">
        <div className="overflow-hidden rounded-lg border border-border">
          {isLoading ? (
            <LoadingBlock />
          ) : error ? (
            <ErrorBlock error={error} />
          ) : !overrides?.length ? (
            <EmptyRow>No overrides — every class and subject uses the global default.</EmptyRow>
          ) : (
            <ul className="divide-y divide-border">
              {overrides.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs capitalize text-text-muted">
                    {o.scope}
                  </span>
                  <span className="flex-1 font-medium text-text">{nameFor(o)}</span>
                  <span className="text-text-muted">
                    CA {weightToPct(o.ca_weight)}% · Exam {weightToPct(o.exam_weight)}%
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete override"
                    onClick={() =>
                      remove
                        .mutateAsync(o.id)
                        .then(() => toast.success("Override removed."))
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

        <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto_auto_auto] sm:items-end">
          <Field label="Scope">
            <Select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value as "class" | "subject");
                setRefId("");
              }}
            >
              <option value="class">Class</option>
              <option value="subject">Subject</option>
            </Select>
          </Field>
          <Field label={scope === "class" ? "Class" : "Subject"}>
            <Select
              value={refId}
              onChange={(e) => setRefId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Choose…</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="CA %">
            <Input
              type="number"
              className="w-20"
              value={caPct}
              onChange={(e) => setCaPct(e.target.value)}
            />
          </Field>
          <Field label="Exam %">
            <Input
              type="number"
              className="w-20"
              value={examPct}
              onChange={(e) => setExamPct(e.target.value)}
            />
          </Field>
          <Button onClick={add} loading={upsert.isPending}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
