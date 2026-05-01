import { useState, type FormEvent } from "react";

import type { AuditActionDescriptor, AuditFilters } from "@/lib/api/audits";

interface AuditFilterBarProps {
  initial: AuditFilters;
  catalog: AuditActionDescriptor[];
  onApply: (filters: AuditFilters) => void;
}

export function AuditFilterBar({ initial, catalog, onApply }: AuditFilterBarProps) {
  const [actor, setActor] = useState(initial.actor ?? "");
  const [action, setAction] = useState(
    Array.isArray(initial.action) ? initial.action.join(",") : initial.action ?? "",
  );
  const [targetUser, setTargetUser] = useState(initial.target_user ?? "");
  const [since, setSince] = useState(initial.since?.slice(0, 10) ?? "");
  const [until, setUntil] = useState(initial.until?.slice(0, 10) ?? "");
  const [successFilter, setSuccessFilter] = useState<"any" | "true" | "false">(
    initial.success === undefined ? "any" : initial.success ? "true" : "false",
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    onApply({
      actor: actor.trim() || undefined,
      action: action.trim() || undefined,
      target_user: targetUser.trim() || undefined,
      since: since ? new Date(since + "T00:00:00Z").toISOString() : undefined,
      until: until ? new Date(until + "T23:59:59Z").toISOString() : undefined,
      success: successFilter === "any" ? undefined : successFilter === "true",
    });
  }

  function clear() {
    setActor("");
    setAction("");
    setTargetUser("");
    setSince("");
    setUntil("");
    setSuccessFilter("any");
    onApply({});
  }

  const inputStyle: React.CSSProperties = {
    height: 28,
    padding: "0 8px",
    background: "var(--color-bg-2)",
    border: "1px solid var(--color-border)",
    color: "var(--color-fg-0)",
    borderRadius: 3,
    fontFamily: "var(--font-sans)",
    fontSize: 11.5,
    outline: "none",
  };

  return (
    <form
      onSubmit={submit}
      style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        alignItems: "center",
        padding: 10,
        background: "var(--color-bg-1)",
        border: "1px solid var(--color-border)",
        borderRadius: 4,
        marginBottom: 14,
      }}
    >
      <input
        style={{ ...inputStyle, width: 120 }}
        type="date"
        value={since}
        onChange={(e) => setSince(e.target.value)}
        title="Since (UTC)"
      />
      <span className="dim" style={{ fontSize: 11 }}>→</span>
      <input
        style={{ ...inputStyle, width: 120 }}
        type="date"
        value={until}
        onChange={(e) => setUntil(e.target.value)}
        title="Until (UTC)"
      />
      <input
        style={{ ...inputStyle, width: 110 }}
        placeholder="actor"
        value={actor}
        onChange={(e) => setActor(e.target.value)}
      />
      <select
        style={{ ...inputStyle, width: 160 }}
        value={action}
        onChange={(e) => setAction(e.target.value)}
      >
        <option value="">all actions</option>
        {catalog.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>
      <input
        style={{ ...inputStyle, width: 130 }}
        placeholder="target user"
        value={targetUser}
        onChange={(e) => setTargetUser(e.target.value)}
      />
      <select
        style={{ ...inputStyle, width: 110 }}
        value={successFilter}
        onChange={(e) => setSuccessFilter(e.target.value as typeof successFilter)}
      >
        <option value="any">any result</option>
        <option value="true">success</option>
        <option value="false">failure</option>
      </select>
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
