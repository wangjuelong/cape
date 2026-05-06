import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

import { Icon } from "./icons";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { isFlagEnabled, useFeatureFlags } from "@/hooks/useFeatureFlags";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  /** api.conf flag that gates this nav item; missing = always shown */
  flag?: string;
  /** When true, render as a normal anchor (browser navigation, leaves SPA). */
  external?: boolean;
  /** When true, render only when useCurrentUser().is_staff is true. */
  staffOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: Icon.grid },
  { to: "/submit", label: "Submit", icon: Icon.upload, flag: "filecreate" },
  { to: "/recent", label: "Recent", icon: Icon.list, flag: "tasklist" },
  { to: "/pending", label: "Pending", icon: Icon.pulse, flag: "tasklist" },
  { to: "/search", label: "Search", icon: Icon.search, flag: "extendedtasksearch" },
  { to: "/configs", label: "Configs", icon: Icon.tag },
  // Compare: upstream nav doesn't expose this — users enter via the
  // "Compare" button on a task detail page (/compare/<task_id>/). The
  // SPA route still exists but is intentionally not advertised here.
  { to: "/stats", label: "Statistics", icon: Icon.pulse, flag: "statistics" },
];

const ADMIN_ITEMS: NavItem[] = [
  { to: "/machines", label: "Machines", icon: Icon.cog, flag: "machinelist" },
  { to: "/audit", label: "Audit", icon: Icon.doc, staffOnly: true },
  { to: "/users", label: "Users", icon: Icon.users, staffOnly: true },
  { to: "/tokens", label: "Tokens", icon: Icon.keyRound, staffOnly: true },
  { to: "/docs", label: "API Docs", icon: Icon.doc },
];

function NavRow({ item }: { item: NavItem }) {
  const IconCmp = item.icon;
  const inner = (
    <>
      <span className="ico">
        <IconCmp size={14} />
      </span>
      <span>{item.label}</span>
      {item.badge && <span className="badge">{item.badge}</span>}
    </>
  );
  if (item.external) {
    return (
      <a href={item.to} className="nav-item">
        {inner}
      </a>
    );
  }
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
    >
      {inner}
    </NavLink>
  );
}

export function Sidebar() {
  const flagsQuery = useFeatureFlags();
  const flags = flagsQuery.data;
  const meQuery = useCurrentUser();
  const isStaff = meQuery.data?.is_staff ?? false;
  const visible = (item: NavItem) => {
    if (item.flag && !isFlagEnabled(flags, item.flag)) return false;
    if (item.staffOnly && !isStaff) return false;
    return true;
  };

  return (
    <aside className="sidebar">
      <div className="nav-section">Workspace</div>
      {NAV_ITEMS.filter(visible).map((item) => (
        <NavRow key={item.to} item={item} />
      ))}

      <div className="nav-section">Admin</div>
      {ADMIN_ITEMS.filter(visible).map((item) => (
        <NavRow key={item.to} item={item} />
      ))}
    </aside>
  );
}
