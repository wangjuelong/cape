import { useEffect, useRef, useState, type FormEvent } from "react";
import { DayPicker } from "react-day-picker";
import { enUS } from "date-fns/locale";
import { format } from "date-fns";
import "react-day-picker/style.css";

import type { AuditActionDescriptor, AuditFilters } from "@/lib/api/audits";

interface AuditFilterBarProps {
  initial: AuditFilters;
  catalog: AuditActionDescriptor[];
  onApply: (filters: AuditFilters) => void;
}

function parseISODate(iso: string | undefined): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function fmt(d: Date | undefined): string {
  return d ? format(d, "yyyy-MM-dd") : "";
}

interface DatePickerFieldProps {
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
  placeholder: string;
  title: string;
}

function DatePickerField({ value, onChange, placeholder, title }: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const triggerStyle: React.CSSProperties = {
    height: 28,
    padding: "0 8px",
    background: "var(--color-bg-2)",
    border: "1px solid var(--color-border)",
    color: value ? "var(--color-fg-0)" : "var(--color-fg-2)",
    borderRadius: 3,
    fontFamily: "var(--font-sans)",
    fontSize: 11.5,
    outline: "none",
    width: 120,
    textAlign: "left",
    cursor: "pointer",
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        title={title}
        onClick={() => setOpen((v) => !v)}
        style={triggerStyle}
      >
        {value ? fmt(value) : placeholder}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 50,
            background: "var(--color-bg-1)",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            padding: 4,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          <DayPicker
            mode="single"
            locale={enUS}
            selected={value}
            onSelect={(d) => {
              onChange(d ?? undefined);
              setOpen(false);
            }}
            showOutsideDays
            footer={
              value ? (
                <button
                  type="button"
                  className="btn ghost"
                  style={{ width: "100%", marginTop: 4, fontSize: 11 }}
                  onClick={() => {
                    onChange(undefined);
                    setOpen(false);
                  }}
                >
                  Clear
                </button>
              ) : null
            }
          />
        </div>
      )}
    </div>
  );
}

export function AuditFilterBar({ initial, catalog, onApply }: AuditFilterBarProps) {
  const [actor, setActor] = useState(initial.actor ?? "");
  const [action, setAction] = useState(
    Array.isArray(initial.action) ? initial.action.join(",") : (initial.action ?? ""),
  );
  const [targetUser, setTargetUser] = useState(initial.target_user ?? "");
  const [since, setSince] = useState<Date | undefined>(parseISODate(initial.since));
  const [until, setUntil] = useState<Date | undefined>(parseISODate(initial.until));
  const [successFilter, setSuccessFilter] = useState<"any" | "true" | "false">(
    initial.success === undefined ? "any" : initial.success ? "true" : "false",
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    onApply({
      actor: actor.trim() || undefined,
      action: action.trim() || undefined,
      target_user: targetUser.trim() || undefined,
      since: since ? new Date(fmt(since) + "T00:00:00Z").toISOString() : undefined,
      until: until ? new Date(fmt(until) + "T23:59:59Z").toISOString() : undefined,
      success: successFilter === "any" ? undefined : successFilter === "true",
    });
  }

  function clear() {
    setActor("");
    setAction("");
    setTargetUser("");
    setSince(undefined);
    setUntil(undefined);
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
      <DatePickerField
        value={since}
        onChange={setSince}
        placeholder="Since (UTC)"
        title="Since (UTC)"
      />
      <span className="dim" style={{ fontSize: 11 }}>
        →
      </span>
      <DatePickerField
        value={until}
        onChange={setUntil}
        placeholder="Until (UTC)"
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
      <button type="button" className="btn" onClick={clear} style={{ height: 28, fontSize: 11.5 }}>
        Clear
      </button>
    </form>
  );
}
