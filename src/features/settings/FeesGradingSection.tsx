import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { LoadingBlock, ErrorBlock } from "@/components/ui/State";
import { pctToWeight, weightToPct } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useApplyStandardFee } from "@/features/exam-fees/api";
import { useCurrentYear, useSettings, useUpdateSettings } from "./api";

export function FeesGradingSection() {
  const { data, isLoading, error } = useSettings();
  const { data: year } = useCurrentYear();
  const update = useUpdateSettings();
  const applyStandard = useApplyStandardFee();

  const [weekendRate, setWeekendRate] = useState("");
  const [vacationRate, setVacationRate] = useState("");
  const [examFee, setExamFee] = useState("");
  const [caPct, setCaPct] = useState("");
  const [examPct, setExamPct] = useState("");
  const [confirmApply, setConfirmApply] = useState(false);

  useEffect(() => {
    if (data) {
      setWeekendRate(String(data.weekend_rate));
      setVacationRate(String(data.vacation_rate));
      setExamFee(String(data.exam_fee));
      setCaPct(String(weightToPct(data.default_ca_weight)));
      setExamPct(String(weightToPct(data.default_exam_weight)));
    }
  }, [data]);

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} />;

  const currency = data?.currency ?? "GH₵";
  const caNum = Number(caPct);
  const examNum = Number(examPct);
  const weightsOk = Number.isFinite(caNum) && Number.isFinite(examNum) && caNum + examNum === 100;

  async function save() {
    const wr = Number(weekendRate);
    const vr = Number(vacationRate);
    const ef = Number(examFee);
    if (
      !Number.isFinite(wr) || wr < 0 ||
      !Number.isFinite(vr) || vr < 0 ||
      !Number.isFinite(ef) || ef < 0
    ) {
      toast.error("Fee amounts must be zero or a positive number.");
      return;
    }
    if (!weightsOk) {
      toast.error("CA % and Exam % must add up to 100.");
      return;
    }
    try {
      await update.mutateAsync({
        weekend_rate: wr,
        vacation_rate: vr,
        exam_fee: ef,
        default_ca_weight: pctToWeight(caNum),
        default_exam_weight: pctToWeight(examNum),
      });
      toast.success("Fees & grading saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    }
  }

  async function applyToAll() {
    const ef = Number(examFee);
    if (!Number.isFinite(ef) || ef <= 0) {
      toast.error("Enter a standard examination fee greater than zero first.");
      return;
    }
    try {
      if (String(ef) !== String(data?.exam_fee)) {
        await update.mutateAsync({ exam_fee: ef });
      }
      const n = await applyStandard.mutateAsync({ amount: ef, classId: "all" });
      toast.success(`Standard fee of ${formatMoney(ef, currency)} applied to ${n} student${n === 1 ? "" : "s"}.`);
      setConfirmApply(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not apply the fee.");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Tuition rates"
          description="Charged per day a student is marked Present. Same for every class."
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Weekend rate (Sat & Sun)" hint="Applied every weekend, all year.">
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-muted">{currency}</span>
                <Input
                  type="number"
                  min={0}
                  step="0.5"
                  value={weekendRate}
                  onChange={(e) => setWeekendRate(e.target.value)}
                />
              </div>
            </Field>
            <Field
              label="Vacation rate (Mon–Wed)"
              hint="Only on days inside a vacation period (see the Calendar tab)."
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-muted">{currency}</span>
                <Input
                  type="number"
                  min={0}
                  step="0.5"
                  value={vacationRate}
                  onChange={(e) => setVacationRate(e.target.value)}
                />
              </div>
            </Field>
          </div>
          <p className="rounded-lg bg-surface-muted p-3 text-xs text-text-muted">
            Thursday and Friday, and normal term weekdays, are not charged.
          </p>
          <Field
            label="Standard examination fee"
            hint="The amount due per student on the Exam Fees screen. Apply it to set every student's balance."
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-text-muted">{currency}</span>
              <Input
                type="number"
                min={0}
                step="0.5"
                value={examFee}
                onChange={(e) => setExamFee(e.target.value)}
                className="sm:max-w-40"
              />
              <Button
                variant="outline"
                onClick={() => setConfirmApply(true)}
                disabled={!year || Number(examFee) <= 0}
              >
                Apply to all students
              </Button>
            </div>
          </Field>
          {!year && (
            <p className="text-xs text-warning">
              Set a current academic year before applying the standard fee.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Grading weights (default)"
          description="The split between Continuous Assessment and the final Exam. Can be overridden per class or per subject later."
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="CA weight (%)">
              <Input
                type="number"
                min={0}
                max={100}
                value={caPct}
                onChange={(e) => setCaPct(e.target.value)}
              />
            </Field>
            <Field label="Exam weight (%)">
              <Input
                type="number"
                min={0}
                max={100}
                value={examPct}
                onChange={(e) => setExamPct(e.target.value)}
              />
            </Field>
          </div>
          <p
            className={
              weightsOk
                ? "text-xs text-text-muted"
                : "text-xs font-medium text-danger"
            }
          >
            {weightsOk
              ? `Total = ${caNum + examNum}%. Grade bands: A ≥ 80 · B ≥ 70 · C ≥ 60 · D ≥ 50 · else F.`
              : `Total = ${caNum + examNum}% — must equal 100%.`}
          </p>
          <div className="flex justify-end">
            <Button onClick={save} loading={update.isPending}>
              Save changes
            </Button>
          </div>
        </CardBody>
      </Card>

      <Dialog
        open={confirmApply}
        onClose={() => setConfirmApply(false)}
        title="Apply standard examination fee?"
        description={
          year
            ? `Sets the amount due to ${formatMoney(Number(examFee) || 0, currency)} for every active student in ${year.hijri_label} AH. Payments already recorded are kept.`
            : ""
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmApply(false)}>
              Cancel
            </Button>
            <Button onClick={applyToAll} loading={applyStandard.isPending || update.isPending}>
              Apply
            </Button>
          </>
        }
      />
    </div>
  );
}
