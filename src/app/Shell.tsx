import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/cn";
import { checkForUpdate, installUpdate } from "@/lib/updater";

export function Shell() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("mna.sidebarCollapsed") === "1",
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("mna.sidebarCollapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Silent background check, once per app launch. A few seconds' delay keeps
  // it off the critical path of first paint; failure (e.g. no network on an
  // offline school computer) is expected and stays silent — only a found
  // update surfaces anything to the user.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const update = await checkForUpdate();
      if (cancelled || !update) return;
      toast.info(`Version ${update.version} is available`, {
        duration: Infinity,
        action: {
          label: "Update & Restart",
          onClick: () => {
            toast.promise(installUpdate(update), {
              loading: "Downloading update…",
              success: "Update installed — restarting…",
              error: "Update failed. You can try again from Backup & Recovery.",
            });
          },
        },
      });
    }, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="flex h-full overflow-hidden">
      {isDesktop && (
        <aside
          className={cn(
            "shrink-0 border-r border-border bg-surface transition-[width] duration-200",
            collapsed ? "w-16" : "w-60",
          )}
        >
          <Sidebar collapsed={collapsed} />
        </aside>
      )}

      {!isDesktop && mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-border bg-surface shadow-xl">
            <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          isDesktop={isDesktop}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          onOpenMenu={() => setMobileOpen(true)}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
