import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Eye, EyeOff } from "lucide-react";

import { useToast } from "@/components/shared/Toast";
import type { AdminTokenRow } from "@/lib/api/tokens";

interface Props {
  rows: AdminTokenRow[];
  onRotate: (row: AdminTokenRow) => void;
  onRevoke: (row: AdminTokenRow) => void;
  pendingUserId: number | null;
}

function maskToken(key: string): string {
  if (key.length <= 10) return key;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export function TokenListTable({ rows, onRotate, onRevoke, pendingUserId }: Props) {
  const { showToast } = useToast();
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());

  if (rows.length === 0) {
    return (
      <div className="dim" style={{ padding: 16 }}>
        No active tokens.
      </div>
    );
  }

  function toggleReveal(userId: number) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function copy(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      showToast("Token copied to clipboard.", "success");
    } catch {
      showToast("Copy failed — clipboard permission denied.", "error");
    }
  }

  return (
    <table className="data" style={{ width: "100%", fontSize: 12 }}>
      <thead>
        <tr>
          <th>Token</th>
          <th style={{ width: 200 }}>Owner</th>
          <th style={{ width: 140 }}>Created</th>
          <th style={{ width: 200 }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const busy = pendingUserId === row.user_id;
          const revealed = revealedIds.has(row.user_id);
          const display = row.key ? (revealed ? row.key : maskToken(row.key)) : "—";
          return (
            <tr key={row.user_id} style={{ opacity: row.is_active ? 1 : 0.6 }}>
              <td>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <code
                    className="mono"
                    style={{
                      padding: "3px 6px",
                      background: "var(--color-bg-2)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 3,
                      wordBreak: "break-all",
                      flex: 1,
                    }}
                  >
                    {display}
                  </code>
                  {row.key && (
                    <button
                      type="button"
                      className="btn ghost"
                      title={revealed ? "Hide" : "Reveal"}
                      onClick={() => toggleReveal(row.user_id)}
                    >
                      {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  )}
                  {row.key && revealed && (
                    <button
                      type="button"
                      className="btn ghost"
                      title="Copy"
                      onClick={() => copy(row.key!)}
                    >
                      <Copy size={14} />
                    </button>
                  )}
                </div>
              </td>
              <td>
                <div>
                  <Link to={`/users/${row.user_id}`} style={{ fontWeight: 600 }}>
                    {row.username}
                  </Link>
                </div>
                <div className="dim" style={{ fontSize: 11 }}>
                  {row.email || "—"}
                </div>
              </td>
              <td className="dim">
                {row.token_created ? new Date(row.token_created).toISOString().slice(0, 10) : "—"}
              </td>
              <td>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => onRotate(row)}
                  >
                    {busy ? "…" : "Rotate"}
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    disabled={busy}
                    onClick={() => onRevoke(row)}
                  >
                    Revoke
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
