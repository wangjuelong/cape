import { Link } from "react-router-dom";

import type { AdminTokenRow } from "@/lib/api/tokens";

interface Props {
  rows: AdminTokenRow[];
  onGenerate: (row: AdminTokenRow) => void;
  onRotate: (row: AdminTokenRow) => void;
  onRevoke: (row: AdminTokenRow) => void;
  pendingUserId: number | null;
}

export function TokenListTable({ rows, onGenerate, onRotate, onRevoke, pendingUserId }: Props) {
  if (rows.length === 0) {
    return (
      <div className="dim" style={{ padding: 16 }}>
        No users match.
      </div>
    );
  }
  return (
    <table className="table" style={{ width: "100%", fontSize: 12 }}>
      <thead>
        <tr>
          <th style={{ width: 60 }}>#</th>
          <th>Username</th>
          <th>Email</th>
          <th style={{ width: 60 }}>Staff</th>
          <th style={{ width: 200 }}>Token</th>
          <th style={{ width: 220 }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const busy = pendingUserId === row.user_id;
          return (
            <tr key={row.user_id} style={{ opacity: row.is_active ? 1 : 0.6 }}>
              <td className="mono">{row.user_id}</td>
              <td>
                <Link to={`/users/${row.user_id}`}>{row.username}</Link>
              </td>
              <td>{row.email || <span className="dim">—</span>}</td>
              <td>{row.is_staff ? "✓" : ""}</td>
              <td>
                {row.has_token ? (
                  <span title={row.token_created ?? ""}>✅ Active</span>
                ) : (
                  <span className="dim">⊘ None</span>
                )}
              </td>
              <td style={{ display: "flex", gap: 6 }}>
                {row.has_token ? (
                  <>
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
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => onGenerate(row)}
                  >
                    {busy ? "…" : "Generate"}
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
