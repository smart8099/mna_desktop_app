import { convertFileSrc } from "@tauri-apps/api/core";
import avatarPlaceholder from "@/assets/avatar-placeholder.svg";
import { Logo } from "@/components/ui/Logo";
import type { GradebookStudent } from "@/features/results/logic";

export interface ReportCardData {
  schoolName: string;
  yearLabel: string; // e.g. "1448 AH · 2026/2027"
  student: {
    full_name: string;
    student_code: string;
    class_name: string | null;
    gender: string | null;
    photo_path: string | null;
  };
  entry: GradebookStudent;
  attendance: { present: number; absent: number; pct: number | null } | undefined;
  classSize: number;
  generalRemark: string | null;
}

export function ReportCard({ data }: { data: ReportCardData }) {
  const { entry, attendance } = data;

  return (
    <article className="report-card mx-auto max-w-[800px] bg-white p-8 text-[13px] text-slate-900">
      <header className="flex items-center gap-4 border-b-2 border-slate-800 pb-3">
        <Logo className="h-16 w-16 shrink-0" />
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold uppercase tracking-wide">{data.schoolName}</h1>
          <p className="mt-1 text-sm font-semibold uppercase tracking-widest text-slate-600">
            Report Card
          </p>
          <p className="text-xs text-slate-500">Academic Year {data.yearLabel}</p>
        </div>
        <div
          data-testid="student-photo-box"
          className="h-16 w-16 shrink-0 overflow-hidden rounded border border-slate-300 bg-slate-50"
        >
          {data.student.photo_path ? (
            <img
              src={convertFileSrc(data.student.photo_path)}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <img src={avatarPlaceholder} alt="" className="h-full w-full object-cover" />
          )}
        </div>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1">
        <Line label="Student" value={data.student.full_name} />
        <Line label="Student ID" value={data.student.student_code} />
        <Line label="Class" value={data.student.class_name ?? "—"} />
        <Line label="Gender" value={data.student.gender ?? "—"} />
      </section>

      <section className="mt-4 grid grid-cols-3 gap-3 rounded border border-slate-300 p-3 text-center">
        <Stat label="Present days" value={String(attendance?.present ?? 0)} />
        <Stat label="Absent days" value={String(attendance?.absent ?? 0)} />
        <Stat label="Attendance" value={attendance?.pct == null ? "—" : `${attendance.pct}%`} />
      </section>

      <table className="mt-4 w-full border-collapse text-left">
        <thead>
          <tr className="border-y border-slate-400 text-[11px] uppercase text-slate-600">
            <th className="py-1.5 pr-2">Subject</th>
            <th className="py-1.5 px-2 text-right">CA</th>
            <th className="py-1.5 px-2 text-right">Exam</th>
            <th className="py-1.5 px-2 text-right">Total</th>
            <th className="py-1.5 px-2 text-center">Grade</th>
            <th className="py-1.5 px-2 text-center">Position</th>
            <th className="py-1.5 pl-2">Remark</th>
          </tr>
        </thead>
        <tbody>
          {entry.cells.map((c) => (
            <tr key={c.subject_id} className="border-b border-slate-200">
              <td className="py-1.5 pr-2 font-medium">{c.name}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{c.ca ?? "—"}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{c.exam ?? "—"}</td>
              <td className="py-1.5 px-2 text-right font-semibold tabular-nums">
                {c.total ?? "—"}
              </td>
              <td className="py-1.5 px-2 text-center font-semibold">{c.grade}</td>
              <td className="py-1.5 px-2 text-center tabular-nums">{c.position ?? "—"}</td>
              <td className="py-1.5 pl-2 text-slate-600">{c.remark ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-4 flex flex-wrap gap-x-10 gap-y-1 rounded bg-slate-100 p-3">
        <Line label="Overall average" value={entry.average == null ? "—" : String(entry.average)} />
        <Line label="Overall grade" value={entry.overall_grade} />
        <Line
          label="Position in class"
          value={
            entry.overall_position == null
              ? "—"
              : `${entry.overall_position} of ${data.classSize}`
          }
        />
      </section>

      <section className="mt-4">
        <p className="text-[11px] font-semibold uppercase text-slate-600">Teacher&apos;s remark</p>
        <p className="mt-1 min-h-[2.5rem] border-b border-dashed border-slate-300 pb-1">
          {data.generalRemark ?? ""}
        </p>
      </section>

      <footer className="mt-10 flex justify-between text-xs text-slate-600">
        <span>Administrator&apos;s signature: ____________________</span>
        <span>Date: ____________</span>
      </footer>
    </article>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-slate-500">{label}: </span>
      <span className="font-medium">{value}</span>
    </p>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[11px] uppercase text-slate-500">{label}</div>
    </div>
  );
}
