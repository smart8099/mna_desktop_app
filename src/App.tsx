import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./app/Shell";
import { LoadingBlock } from "./components/ui/State";

// Route-level code splitting: each page ships in its own chunk and only loads
// when the user navigates to it, instead of all of them upfront in one bundle.
const DashboardPage = lazy(() =>
  import("./features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const StudentsPage = lazy(() =>
  import("./features/students/StudentsPage").then((m) => ({ default: m.StudentsPage })),
);
const StudentDetailPage = lazy(() =>
  import("./features/students/StudentDetailPage").then((m) => ({ default: m.StudentDetailPage })),
);
const TeachersPage = lazy(() =>
  import("./features/teachers/TeachersPage").then((m) => ({ default: m.TeachersPage })),
);
const TeacherDetailPage = lazy(() =>
  import("./features/teachers/TeacherDetailPage").then((m) => ({ default: m.TeacherDetailPage })),
);
const AttendancePage = lazy(() =>
  import("./features/attendance/AttendancePage").then((m) => ({ default: m.AttendancePage })),
);
const FeesPage = lazy(() =>
  import("./features/fees/FeesPage").then((m) => ({ default: m.FeesPage })),
);
const ExamFeesPage = lazy(() =>
  import("./features/exam-fees/ExamFeesPage").then((m) => ({ default: m.ExamFeesPage })),
);
const ResultsPage = lazy(() =>
  import("./features/results/ResultsPage").then((m) => ({ default: m.ResultsPage })),
);
const ReportCardPage = lazy(() =>
  import("./features/report-cards/ReportCardPage").then((m) => ({ default: m.ReportCardPage })),
);
const ReceiptsPage = lazy(() =>
  import("./features/receipts/ReceiptsPage").then((m) => ({ default: m.ReceiptsPage })),
);
const SettingsPage = lazy(() =>
  import("./features/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const BackupPage = lazy(() =>
  import("./features/backup/BackupPage").then((m) => ({ default: m.BackupPage })),
);

export default function App() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />

          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/students/:id" element={<StudentDetailPage />} />
          <Route path="/teachers" element={<TeachersPage />} />
          <Route path="/teachers/:id" element={<TeacherDetailPage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/fees" element={<FeesPage />} />
          <Route path="/exam-fees" element={<ExamFeesPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/report-cards" element={<ReportCardPage />} />
          <Route path="/receipts" element={<ReceiptsPage />} />

          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/backup" element={<BackupPage />} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
