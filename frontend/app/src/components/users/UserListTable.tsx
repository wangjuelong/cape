import { Link } from "react-router-dom";

import type { UserListRow } from "@/lib/api/users";

interface Props {
  rows: UserListRow[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: (checked: boolean) => void;
}

export function UserListTable({ rows, selected, onToggle, onToggleAll }: Props) {
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  return (
    <table className="data" style={{ marginTop: 12 }}>
      <thead>
        <tr>
          <th style={{ width: 28 }}>
            <input
              type="checkbox"
              checked={allChecked}
              onChange={(e) => onToggleAll(e.target.checked)}
            />
          </th>
          <th>Username</th>
          <th>Email</th>
          <th style={{ width: 60 }}>Staff</th>
          <th style={{ width: 60 }}>Active</th>
          <th style={{ width: 140 }}>Last login</th>
          <th style={{ width: 80 }}>Groups</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <input
                type="checkbox"
                checked={selected.has(r.id)}
                onChange={() => onToggle(r.id)}
              />
            </td>
            <td className="mono">
              <Link to={`/users/${r.id}`}>{r.username}</Link>
            </td>
            <td className="dim mono" style={{ fontSize: 11 }}>
              {r.email || "—"}
            </td>
            <td>{r.is_staff ? "✓" : ""}</td>
            <td>{r.is_active ? "✓" : <span className="dim">⊘</span>}</td>
            <td className="dim mono" style={{ fontSize: 10.5 }}>
              {r.last_login ?? "—"}
            </td>
            <td className="dim">{r.group_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
