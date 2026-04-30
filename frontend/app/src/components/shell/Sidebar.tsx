import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

import { Icon } from "./icons";
import { isFlagEnabled, useFeatureFlags } from "@/hooks/useFeatureFlags";

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
  { to: "/configs", label: "Configs", icon: Icon.tag },
  { to: "/compare", label: "Compare", icon: Icon.diff },
  { to: "/stats", label: "Statistics", icon: Icon.pulse, flag: "statistics" },
];

const ADMIN_ITEMS: NavItem[] = [
  { to: "/machines", label: "Machines", icon: Icon.cog, flag: "machinelist" },
  { to: "/audit", label: "Audit", icon: Icon.doc },
  { to: "/docs", label: "API Docs", icon: Icon.doc },
];

function NavRow({ item }: { item: NavItem }) {
  const IconCmp = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === "/dashboard"}
      className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
    >
      <span className="ico">
        <IconCmp size={14} />
      </span>
      <span>{item.label}</span>
      {item.badge && <span className="badge">{item.badge}</span>}
    </NavLink>
  );
}

export function Sidebar() {
  const flagsQuery = useFeatureFlags();
  const flags = flagsQuery.data;
  const visible = (item: NavItem) => !item.flag || isFlagEnabled(flags, item.flag);

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
