import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/shared/Toast";
import { listPermissions, type Permission } from "@/lib/api/permissions";
import { setUserPermissions, type UserDetail } from "@/lib/api/users";
import { queryKeys } from "@/lib/query-keys";

interface Props {
  user: UserDetail;
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

export function PermissionsPicker({ user }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const permsQ = useQuery({
    queryKey: queryKeys.permissions.list(),
    queryFn: () => listPermissions(),
    staleTime: 60_000,
  });
  const [selected, setSelected] = useState<Set<number>>(new Set(user.permission_ids));
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelected(new Set(user.permission_ids));
  }, [user.permission_ids]);

  const grouped = useMemo(() => groupBy(permsQ.data ?? []), [permsQ.data]);

  const m = useMutation({
    mutationFn: () => setUserPermissions(user.id, Array.from(selected)),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.users.detail(user.id), data);
      showToast("Permissions saved.", "success");
    },
    onError: () => showToast("Save failed.", "error"),
  });

  const dirty = useMemo(() => {
    const a = new Set(user.permission_ids);
    if (a.size !== selected.size) return true;
    for (const id of selected) if (!a.has(id)) return true;
    return false;
  }, [selected, user.permission_ids]);

  function togglePerm(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
    <div style={{ display: "grid", gap: 12, maxWidth: 600, fontSize: 12 }}>
      <div className="dim" style={{ fontSize: 11 }}>
        {selected.size} permissions assigned · {grouped.length} content types
      </div>
      <div
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: 4,
          background: "var(--color-bg-2)",
          padding: 8,
          maxHeight: 420,
          overflow: "auto",
        }}
      >
        {grouped.map(([key, perms]) => {
          const groupSelected = perms.filter((p) => selected.has(p.id)).length;
          const isOpen = openGroups.has(key);
          return (
            <div key={key}>
              <button
                onClick={() => toggleGroupOpen(key)}
                style={{
                  background: "transparent",
                  border: 0,
                  color: "inherit",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  padding: "5px 6px",
                  fontSize: 11.5,
                  display: "flex",
                  gap: 6,
                }}
              >
                <span className="mono">{isOpen ? "▾" : "▸"}</span>
                <span className="mono">{key}</span>
                <span className="dim">
                  · {groupSelected}/{perms.length}
                </span>
              </button>
              {isOpen && (
                <div style={{ paddingLeft: 22, display: "grid", gap: 4 }}>
                  {perms.map((p) => (
                    <label key={p.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => togglePerm(p.id)}
                      />
                      <span className="mono" style={{ fontSize: 10.5 }}>
                        {p.codename}
                      </span>
                      <span className="dim" style={{ fontSize: 10 }}>
                        {p.name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button
        className="btn primary"
        disabled={!dirty || m.isPending}
        onClick={() => m.mutate()}
        style={{ alignSelf: "flex-start" }}
      >
        {m.isPending ? "Saving…" : "Save permissions"}
      </button>
    </div>
  );
}
