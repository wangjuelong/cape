import { Link } from "react-router-dom";

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
          <th style={{ width: 140 }}>Actions</th>
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
                <button
                  type="button"
                  className="btn danger"
                  disabled={busy}
                  onClick={() => onRevoke(row)}
                >
                  {busy ? "…" : "Revoke"}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
