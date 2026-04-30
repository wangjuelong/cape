import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

import { Icon } from "./icons";
import { isFlagEnabled, useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useLogout } from "@/hooks/useLogout";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  /** api.conf flag that gates this nav item; missing = always shown */
  flag?: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: Icon.grid },
  { to: "/submit", label: "Submit", icon: Icon.upload, flag: "filecreate" },
  { to: "/recent", label: "Recent", icon: Icon.list, flag: "tasklist" },
  { to: "/pending", label: "Pending", icon: Icon.pulse, flag: "tasklist" },
  { to: "/search", label: "Search", icon: Icon.search, flag: "extendedtasksearch" },
  { to: "/compare", label: "Compare", icon: Icon.diff },
  { to: "/stats", label: "Statistics", icon: Icon.pulse, flag: "statistics" },
];

const ADMIN_ITEMS: NavItem[] = [
  { to: "/machines", label: "Machines", icon: Icon.cog, flag: "machinelist" },
  { to: "/audit", label: "Audit", icon: Icon.doc },
  { to: "/docs", label: "API Docs", icon: Icon.doc },
];

function NavSection({ label }: { label: string }) {
  return (
    <div
      className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider"
      style={{ color: "var(--color-fg-2)" }}
    >
      {label}
    </div>
  );
}

function NavRow({ item }: { item: NavItem }) {
  const IconCmp = item.icon;
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          "flex h-8 items-center gap-2 px-3 text-xs transition-colors",
          isActive ? "border-l-2" : "border-l-2 border-transparent",
        )
      }
      style={({ isActive }) =>
        isActive
          ? {
              background: "var(--color-accent-soft)",
              borderLeftColor: "var(--color-accent)",
              color: "var(--color-fg-0)",
            }
          : { color: "var(--color-fg-1)" }
      }
    >
      <IconCmp size={14} />
      <span className="flex-1">{item.label}</span>
      {item.badge && (
        <span
          className="min-w-4 rounded px-1.5 text-center text-[10px]"
          style={{ background: "var(--color-bg-3)", color: "var(--color-fg-1)" }}
        >
          {item.badge}
        </span>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const flagsQuery = useFeatureFlags();
  const flags = flagsQuery.data;
  const visible = (item: NavItem) => !item.flag || isFlagEnabled(flags, item.flag);
  const { mutate: signOut, isPending: isSigningOut } = useLogout();

  return (
    <aside
      className="flex w-52 flex-col border-r"
      style={{
        background: "var(--color-bg-1)",
        borderColor: "var(--color-border)",
      }}
    >
      <NavSection label="Workspace" />
      {NAV_ITEMS.filter(visible).map((item) => (
        <NavRow key={item.to} item={item} />
      ))}

      <NavSection label="Admin" />
      {ADMIN_ITEMS.filter(visible).map((item) => (
        <NavRow key={item.to} item={item} />
      ))}

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => {
          if (isSigningOut) return;
          signOut();
        }}
        disabled={isSigningOut}
        className={cn(
          "flex h-8 items-center gap-2 px-3 text-left text-xs transition-colors",
          isSigningOut
            ? "cursor-wait opacity-60"
            : "cursor-pointer hover:bg-[var(--color-bg-2)] hover:text-[var(--color-fg-0)]",
        )}
        style={{ color: "var(--color-fg-2)" }}
      >
        <Icon.exit size={14} />
        <span>{isSigningOut ? "Signing out…" : "Sign out"}</span>
      </button>
    </aside>
  );
}
