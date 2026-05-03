import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { listPermissions, type Permission } from "@/lib/api/permissions";
import { queryKeys } from "@/lib/query-keys";

interface Props {
  /** Currently selected permission ids. */
  value: number[];
  /** Called whenever the selection changes. Caller handles save. */
  onChange: (ids: number[]) => void;
  /** Disable interaction (e.g. while a save mutation is pending). */
  disabled?: boolean;
}

function groupBy(perms: Permission[]) {
  const map = new Map<string, Permission[]>();
  for (const p of perms) {
    const key = `${p.content_type.app_label}.${p.content_type.model}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function PermissionsPicker({ value, onChange, disabled }: Props) {
  const permsQ = useQuery({
    queryKey: queryKeys.permissions.list(),
    queryFn: () => listPermissions(),
    staleTime: 60_000,
  });

  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => groupBy(permsQ.data ?? []), [permsQ.data]);
  const selectedSet = useMemo(() => new Set(value), [value]);

  function togglePerm(id: number) {
    if (disabled) return;
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  function toggleGroupOpen(key: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (permsQ.isLoading) return <div className="dim mono">Loading permissions…</div>;

  return (
    <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
      <div className="dim" style={{ fontSize: 11 }}>
        {selectedSet.size} permissions selected · {grouped.length} content types
      </div>
      <div
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: 4,
          background: "var(--color-bg-2)",
          padding: 8,
          maxHeight: 420,
          overflow: "auto",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {grouped.map(([key, perms]) => {
          const groupSelected = perms.filter((p) => selectedSet.has(p.id)).length;
          const isOpen = openGroups.has(key);
          return (
            <div key={key}>
              <button
                type="button"
                onClick={() => toggleGroupOpen(key)}
                style={{
                  background: "transparent", border: 0, color: "inherit",
                  cursor: "pointer", textAlign: "left", width: "100%",
                  padding: "5px 6px", fontSize: 11.5, display: "flex", gap: 6,
                }}
              >
                <span className="mono">{isOpen ? "▾" : "▸"}</span>
                <span className="mono">{key}</span>
                <span className="dim">· {groupSelected}/{perms.length}</span>
              </button>
              {isOpen && (
                <div style={{ paddingLeft: 22, display: "grid", gap: 4 }}>
                  {perms.map((p) => (
                    <label
                      key={p.id}
                      style={{ display: "flex", gap: 6, alignItems: "center" }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSet.has(p.id)}
                        disabled={disabled}
                        onChange={() => togglePerm(p.id)}
                      />
                      <span className="mono" style={{ fontSize: 10.5 }}>{p.codename}</span>
                      <span className="dim" style={{ fontSize: 10 }}>{p.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
