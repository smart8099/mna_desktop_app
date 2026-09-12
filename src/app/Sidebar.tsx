import { NavLink } from "react-router-dom";
import { NAV } from "./nav";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";
import { useIsAdmin } from "@/features/auth/AuthContext";

export function Sidebar({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const isAdmin = useIsAdmin();
  const items = NAV.filter((n) => !n.adminOnly || isAdmin);

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex h-16 items-center gap-2.5 border-b border-border px-4",
          collapsed && "justify-center px-0",
        )}
      >
        <Logo className="h-9 w-9 shrink-0" />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold text-text">MNA</div>
            <div className="truncate text-xs text-text-muted">Management System</div>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {items.map(({ to, label, icon: Icon, ready }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0",
                isActive
                  ? "bg-accent-soft text-primary"
                  : "text-text-muted hover:bg-surface-muted hover:text-text",
              )
            }
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
            {!collapsed && !ready && (
              <span className="ml-auto rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                soon
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {!collapsed && (
        <div className="border-t border-border p-3 text-[11px] text-text-muted">
          Madrasatul Nurul Absar · v0.1.0
        </div>
      )}
    </div>
  );
}
