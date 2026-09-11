import {
  LayoutDashboard,
  Users,
  GraduationCap,
  CalendarCheck,
  Wallet,
  ReceiptText,
  ClipboardList,
  FileText,
  Printer,
  Settings,
  DatabaseBackup,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  ready?: boolean;
  phase?: number;
}

export const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, ready: true },
  { to: "/students", label: "Students", icon: Users, ready: true },
  { to: "/teachers", label: "Teachers", icon: GraduationCap, ready: true },
  { to: "/attendance", label: "Attendance", icon: CalendarCheck, ready: true },
  { to: "/fees", label: "Fees", icon: Wallet, ready: true },
  { to: "/exam-fees", label: "Exam Fees", icon: ReceiptText, ready: true },
  { to: "/results", label: "Results", icon: ClipboardList, ready: true },
  { to: "/report-cards", label: "Report Cards", icon: FileText, ready: true },
  { to: "/receipts", label: "Exam Receipts", icon: Printer, ready: true },
  { to: "/settings", label: "Settings", icon: Settings, ready: true },
  { to: "/backup", label: "Backup & Recovery", icon: DatabaseBackup, ready: true },
];

export function titleForPath(pathname: string): string {
  const hit = NAV.find((n) => pathname.startsWith(n.to));
  return hit?.label ?? "MNA Management System";
}
