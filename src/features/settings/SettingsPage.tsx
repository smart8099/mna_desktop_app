import { useState } from "react";
import { cn } from "@/lib/cn";
import { SchoolSection } from "./SchoolSection";
import { FeesGradingSection } from "./FeesGradingSection";
import { WeightOverridesSection } from "./WeightOverridesSection";
import { AcademicYearsSection } from "./AcademicYearsSection";
import { CalendarSection } from "./CalendarSection";
import { ListEditorSection } from "./ListEditorSection";
import { SubjectsSection } from "./SubjectsSection";

const TABS = [
  { id: "school", label: "School" },
  { id: "fees", label: "Fees & Grading" },
  { id: "overrides", label: "Grading Overrides" },
  { id: "years", label: "Academic Years" },
  { id: "calendar", label: "Calendar" },
  { id: "classes", label: "Classes" },
  { id: "subjects", label: "Subjects" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SettingsPage() {
  const [tab, setTab] = useState<TabId>("school");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-text">Settings</h2>
        <p className="mt-1 text-sm text-text-muted">
          These values drive fees, grading and report cards across the app.
        </p>
      </div>

      <div className="-mx-1 overflow-x-auto">
        <div className="flex gap-1 border-b border-border px-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-text-muted hover:text-text",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "school" && <SchoolSection />}
      {tab === "fees" && <FeesGradingSection />}
      {tab === "overrides" && <WeightOverridesSection />}
      {tab === "years" && <AcademicYearsSection />}
      {tab === "calendar" && <CalendarSection />}
      {tab === "classes" && (
        <ListEditorSection
          table="classes"
          title="Classes"
          description="The six class levels. Order controls how they appear everywhere."
          singular="class"
        />
      )}
      {tab === "subjects" && <SubjectsSection />}
    </div>
  );
}
