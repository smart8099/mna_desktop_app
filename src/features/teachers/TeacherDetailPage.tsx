import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, Pencil, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { LoadingBlock, EmptyRow } from "@/components/ui/State";
import { useIsAdmin } from "@/features/auth/AuthContext";
import { initials } from "@/features/students/logic";
import { useAllAssignments, useTeacher, useTeacherClassLoad } from "./api";
import { TeacherFormDrawer } from "./TeacherFormDrawer";

export function TeacherDetailPage() {
  const isAdmin = useIsAdmin();
  const { id: idParam } = useParams();
  const id = Number(idParam);

  const { data: teacher, isLoading } = useTeacher(Number.isFinite(id) ? id : null);
  const load = useTeacherClassLoad(id);
  const assignments = useAllAssignments();
  const [editOpen, setEditOpen] = useState(false);

  const mine = useMemo(
    () => (assignments.data ?? []).filter((a) => a.teacher_id === id),
    [assignments.data, id],
  );
  const subjectCount = useMemo(
    () => new Set(mine.map((a) => a.subject_id)).size,
    [mine],
  );
  const studentsTaught = useMemo(
    () => (load.data ?? []).reduce((t, c) => t + c.students, 0),
    [load.data],
  );

  if (isLoading) return <LoadingBlock />;
  if (!teacher) {
    return (
      <div className="rounded-xl border border-border bg-surface px-6 py-16 text-center">
        <p className="text-sm text-text-muted">That teacher could not be found.</p>
        <Link to="/teachers" className="mt-3 inline-block text-sm text-primary hover:underline">
          Back to teachers
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/teachers"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" />
          Teachers
        </Link>
        {isAdmin && (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        )}
      </div>

      <Card>
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl border border-border bg-surface-muted text-xl font-semibold text-text-muted">
            {initials(teacher.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-text">{teacher.name}</h2>
              <StatusBadge status={teacher.status} />
            </div>
            <p className="mt-0.5 text-sm text-text-muted">{teacher.teacher_code}</p>
          </div>
        </CardBody>
        <div className="grid grid-cols-2 gap-px border-t border-border bg-border text-sm sm:grid-cols-3 lg:grid-cols-5">
          <Fact label="Teacher ID" value={teacher.teacher_code} />
          <Fact label="Status" value={teacher.status} />
          <Fact label="Contact" value={teacher.contact ?? "—"} />
          <Fact label="Date joined" value={teacher.date_joined ?? "—"} />
          <Fact label="Assignments" value={`${mine.length} · ${subjectCount} subject${subjectCount === 1 ? "" : "s"}`} />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Contact & notes" />
          <CardBody className="space-y-2 text-sm">
            <Row label="Phone" value={teacher.contact} />
            <Row label="Date joined" value={teacher.date_joined} />
            <Row label="Notes" value={teacher.notes} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Teaching load"
            description={
              load.data?.length
                ? `${load.data.length} class${load.data.length === 1 ? "" : "es"} · ${studentsTaught} student${studentsTaught === 1 ? "" : "s"}`
                : undefined
            }
          />
          <CardBody className="p-0">
            {load.isLoading ? (
              <LoadingBlock />
            ) : !load.data?.length ? (
              <EmptyRow>No classes or subjects assigned yet. Use Edit to add some.</EmptyRow>
            ) : (
              <ul className="divide-y divide-border">
                {load.data.map((c) => (
                  <li key={c.class_id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-text">{c.class_name}</span>
                      <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                        <Users className="h-3.5 w-3.5" />
                        {c.students}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-sm text-text-muted">
                      <BookOpen className="h-3.5 w-3.5 shrink-0" />
                      {(c.subjects ?? "").split(",").join(", ")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <TeacherFormDrawer
        open={editOpen}
        teacher={teacher}
        onClose={() => setEditOpen(false)}
        onCreated={() => setEditOpen(false)}
      />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-0.5 font-medium text-text">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-3">
      <span className="w-28 shrink-0 text-text-muted">{label}</span>
      <span className="text-text">{value || "—"}</span>
    </div>
  );
}
