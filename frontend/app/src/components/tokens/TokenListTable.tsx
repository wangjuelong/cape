import { Link } from "react-router-dom";
import { Copy } from "lucide-react";

import { useToast } from "@/components/shared/Toast";
import type { AdminTokenRow } from "@/lib/api/tokens";

interface Props {
  rows: AdminTokenRow[];
  onRevoke: (row: AdminTokenRow) => void;
  pendingUserId: number | null;
}

function maskToken(key: string): string {
  if (key.length <= 8) return key;
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

export function TokenListTable({ rows, onRevoke, pendingUserId }: Props) {
  const { showToast } = useToast();

  async function copy(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      showToast("Token copied to clipboard.", "success");
    } catch {
      showToast("Copy failed — clipboard permission denied.", "error");
    }
  }

  if (rows.length === 0) {
    return (
      <div className="dim" style={{ padding: 16 }}>
        No active tokens.
      </div>
    );
  }
  return (
    <table className="data" style={{ width: "100%", fontSize: 12 }}>
      <thead>
        <tr>
          <th style={{ width: 200 }}>Username</th>
          <th>Token</th>
          <th style={{ width: 180 }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const busy = pendingUserId === row.user_id;
          return (
            <tr key={row.user_id} style={{ opacity: row.is_active ? 1 : 0.6 }}>
              <td>
                <Link to={`/users/${row.user_id}`} style={{ fontWeight: 600 }}>
                  {row.username}
                </Link>
              </td>
              <td>
                <code
                  className="mono"
                  style={{
                    padding: "3px 6px",
                    background: "var(--color-bg-2)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 3,
                    wordBreak: "break-all",
                  }}
                >
                  {row.key ? maskToken(row.key) : "—"}
                </code>
              </td>
              <td>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className="btn ghost"
                    title="Copy token to clipboard"
                    disabled={!row.key}
                    onClick={() => row.key && copy(row.key)}
                    style={{ display: "flex", gap: 4, alignItems: "center" }}
                  >
                    <Copy size={12} /> Copy
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    disabled={busy}
                    onClick={() => onRevoke(row)}
                  >
                    {busy ? "…" : "Revoke"}
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
