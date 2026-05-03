import { useState } from "react";

import type { UserListFilters } from "@/lib/api/users";

interface Props {
  initial: UserListFilters;
  onApply: (next: UserListFilters) => void;
}

const inputStyle: React.CSSProperties = {
  height: 28,
  padding: "0 8px",
  fontSize: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-bg-2)",
  color: "var(--color-fg-0)",
  borderRadius: 3,
  minWidth: 80,
};

export function UserFilterBar({ initial, onApply }: Props) {
  const [search, setSearch] = useState(initial.search ?? "");
  const [isStaff, setIsStaff] = useState<string>(
    initial.is_staff === undefined ? "" : initial.is_staff ? "true" : "false",
  );
  const [isActive, setIsActive] = useState<string>(
    initial.is_active === undefined ? "" : initial.is_active ? "true" : "false",
  );
  const [group, setGroup] = useState(initial.group ?? "");
  const [ordering, setOrdering] = useState(initial.ordering ?? "-date_joined");

  function clear() {
    setSearch("");
    setIsStaff("");
    setIsActive("");
    setGroup("");
    setOrdering("-date_joined");
    onApply({});
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onApply({
      search: search || undefined,
      is_staff: isStaff === "" ? undefined : isStaff === "true",
      is_active: isActive === "" ? undefined : isActive === "true",
      group: group || undefined,
      ordering,
    });
  }

  return (
    <form
      onSubmit={submit}
      style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}
    >
      <input
        style={{ ...inputStyle, minWidth: 200 }}
        placeholder="Search username/email/name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <select style={inputStyle} value={isStaff} onChange={(e) => setIsStaff(e.target.value)}>
        <option value="">staff: any</option>
        <option value="true">is_staff</option>
        <option value="false">not staff</option>
      </select>
      <select style={inputStyle} value={isActive} onChange={(e) => setIsActive(e.target.value)}>
        <option value="">active: any</option>
        <option value="true">active</option>
        <option value="false">inactive</option>
      </select>
      <input
        style={inputStyle}
        placeholder="group"
        value={group}
        onChange={(e) => setGroup(e.target.value)}
      />
      <select style={inputStyle} value={ordering} onChange={(e) => setOrdering(e.target.value)}>
        <option value="-date_joined">newest</option>
        <option value="date_joined">oldest</option>
        <option value="username">username ↑</option>
        <option value="-username">username ↓</option>
        <option value="-last_login">last login ↓</option>
        <option value="last_login">last login ↑</option>
      </select>
      <button type="submit" className="btn primary" style={{ height: 28, fontSize: 11.5 }}>
        Apply
      </button>
      <button type="button" className="btn" onClick={clear} style={{ height: 28, fontSize: 11.5 }}>
        Clear
      </button>
    </form>
  );
}
