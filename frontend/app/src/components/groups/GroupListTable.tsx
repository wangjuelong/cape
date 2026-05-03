import { Link } from "react-router-dom";

import type { GroupListRow } from "@/lib/api/groups";

interface Props {
  rows: GroupListRow[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: (checked: boolean) => void;
}

export function GroupListTable({ rows, selected, onToggle, onToggleAll }: Props) {
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
          <th>Name</th>
          <th style={{ width: 80 }}>Members</th>
          <th style={{ width: 100 }}>Permissions</th>
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
              <Link to={`/groups/${r.id}`}>{r.name}</Link>
            </td>
            <td className="dim">{r.member_count}</td>
            <td className="dim">{r.permission_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
