import { useState } from "react";

import type { AuditActionDescriptor, AuditEvent } from "@/lib/api/audits";

import { ActionBadge } from "./ActionBadge";

interface AuditRowProps {
  event: AuditEvent;
  catalog: AuditActionDescriptor[];
}

export function AuditRow({ event, catalog }: AuditRowProps) {
  const [open, setOpen] = useState(false);

  const ts = new Date(event.timestamp);
  const tsAbs = ts.toISOString().replace("T", " ").slice(0, 19) + "Z";
  const tsRel = relativeTime(ts);

  return (
    <>
      <tr
        onClick={() => setOpen((v) => !v)}
        style={{ cursor: "pointer" }}
        title="Click to toggle metadata"
      >
        <td className="mono dim" style={{ fontSize: 10.5 }} title={tsAbs}>
          {tsRel}
        </td>
        <td className="mono">{event.actor.username ?? <span className="dim">—</span>}</td>
        <td>
          <ActionBadge action={event.action} success={event.success} catalog={catalog} />
        </td>
        <td className="mono dim" style={{ fontSize: 10.5 }}>
          {event.target.label ?? "—"}
        </td>
        <td className="mono dim" style={{ fontSize: 10.5 }}>
          {event.actor.ip ?? "—"}
        </td>
        <td className="dim" style={{ width: 24, textAlign: "center" }}>
          {open ? "▾" : "▸"}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} style={{ background: "var(--color-bg-2)", padding: "8px 14px" }}>
            <div className="mono" style={{ fontSize: 10.5, lineHeight: 1.6 }}>
              <div>
                <span className="dim">timestamp:</span> {tsAbs}
              </div>
              <div>
                <span className="dim">event id:</span> {event.id}
              </div>
              {event.actor.user_agent && (
                <div>
                  <span className="dim">user_agent:</span> {event.actor.user_agent}
                </div>
              )}
              {Object.entries(event.metadata).map(([k, v]) => (
                <div key={k}>
                  <span className="dim">{k}:</span> {String(v)}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function relativeTime(ts: Date): string {
  const seconds = Math.floor((Date.now() - ts.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}d ago`;
  return ts.toISOString().slice(0, 10);
}
