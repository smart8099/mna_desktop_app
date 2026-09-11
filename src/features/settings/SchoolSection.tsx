import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { LoadingBlock, ErrorBlock } from "@/components/ui/State";
import { useSettings, useUpdateSettings } from "./api";

export function SchoolSection() {
  const { data, isLoading, error } = useSettings();
  const update = useUpdateSettings();
  const [form, setForm] = useState({
    school_name: "",
    system_name: "",
    country: "",
    currency: "",
  });

  useEffect(() => {
    if (data) {
      setForm({
        school_name: data.school_name,
        system_name: data.system_name,
        country: data.country,
        currency: data.currency,
      });
    }
  }, [data]);

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} />;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.school_name.trim()) {
      toast.error("School name is required.");
      return;
    }
    try {
      await update.mutateAsync(form);
      toast.success("School details saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    }
  }

  return (
    <Card>
      <CardHeader title="School details" description="Shown on report cards, receipts and the app header." />
      <CardBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="School name">
            <Input value={form.school_name} onChange={set("school_name")} />
          </Field>
          <Field label="System name">
            <Input value={form.system_name} onChange={set("system_name")} />
          </Field>
          <Field label="Country">
            <Input value={form.country} onChange={set("country")} />
          </Field>
          <Field label="Currency symbol" hint="e.g. GH₵">
            <Input value={form.currency} onChange={set("currency")} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button onClick={save} loading={update.isPending}>
            Save changes
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
