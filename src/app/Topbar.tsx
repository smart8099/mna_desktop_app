import { useLocation } from "react-router-dom";
import { Menu, PanelLeftClose, PanelLeftOpen, Moon, Sun, CalendarDays, LogOut, User } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { titleForPath } from "./nav";
import { useCurrentYear } from "@/features/settings/api";
import { useAuth } from "@/features/auth/AuthContext";

function useTheme() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("mna.theme", dark ? "dark" : "light");
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

export function Topbar({
  isDesktop,
  collapsed,
  onToggleCollapse,
  onOpenMenu,
}: {
  isDesktop: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMenu: () => void;
}) {
  const { pathname } = useLocation();
  const { dark, toggle } = useTheme();
  const { data: year } = useCurrentYear();
  const { user, logout } = useAuth();

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 sm:px-4">
      {isDesktop ? (
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} aria-label="Toggle sidebar">
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </Button>
      ) : (
        <Button variant="ghost" size="icon" onClick={onOpenMenu} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
      )}

      <h1 className="truncate text-base font-semibold text-text">
        {titleForPath(pathname)}
      </h1>

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-2.5 py-1.5 text-xs font-medium text-text-muted sm:inline-flex">
          <CalendarDays className="h-3.5 w-3.5" />
          {year ? `${year.hijri_label} AH · ${year.gregorian_label}` : "No academic year set"}
        </span>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
          {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
        {user && (
          <>
            <span className="hidden items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-2.5 py-1.5 text-xs font-medium text-text-muted md:inline-flex">
              <User className="h-3.5 w-3.5" />
              {user.username} · {user.role}
            </span>
            <Button variant="ghost" size="icon" onClick={logout} aria-label="Log out">
              <LogOut className="h-5 w-5" />
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
