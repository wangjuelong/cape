import { useState } from "react";

import type { GroupListFilters } from "@/lib/api/groups";

interface Props {
  initial: GroupListFilters;
  onApply: (next: GroupListFilters) => void;
}

const inputStyle: React.CSSProperties = {
  height: 28, padding: "0 8px", fontSize: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-bg-2)", color: "var(--color-fg-0)",
  borderRadius: 3,
};

export function GroupFilterBar({ initial, onApply }: Props) {
  const [search, setSearch] = useState(initial.search ?? "");

  function clear() {
    setSearch("");
    onApply({});
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onApply({ search: search || undefined });
  }

  return (
    <form
      onSubmit={submit}
      style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}
    >
      <input
        style={{ ...inputStyle, minWidth: 280 }}
        placeholder="Search by name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <button type="submit" className="btn primary" style={{ height: 28, fontSize: 11.5 }}>
        Apply
      </button>
      <button
        type="button"
        className="btn"
        onClick={clear}
        style={{ height: 28, fontSize: 11.5 }}
      >
        Clear
      </button>
    </form>
  );
}
