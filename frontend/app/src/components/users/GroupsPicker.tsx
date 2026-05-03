import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/shared/Toast";
import { listGroups } from "@/lib/api/groups";
import { setUserGroups, type UserDetail } from "@/lib/api/users";
import { queryKeys } from "@/lib/query-keys";

interface Props {
  user: UserDetail;
}

export function GroupsPicker({ user }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const groupsQ = useQuery({
    queryKey: queryKeys.groups.list,
    queryFn: listGroups,
    staleTime: 60_000,
  });
  const [selected, setSelected] = useState<Set<number>>(new Set(user.group_ids));

  useEffect(() => {
    setSelected(new Set(user.group_ids));
  }, [user.group_ids]);

  const m = useMutation({
    mutationFn: () => setUserGroups(user.id, Array.from(selected)),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.users.detail(user.id), data);
      showToast("Groups saved.", "success");
    },
    onError: () => showToast("Save failed.", "error"),
  });

  const all = groupsQ.data ?? [];
  const dirty = useMemo(() => {
    const a = new Set(user.group_ids);
    if (a.size !== selected.size) return true;
    for (const id of selected) if (!a.has(id)) return true;
    return false;
  }, [selected, user.group_ids]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (groupsQ.isLoading) return <div className="dim mono">Loading groups…</div>;

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 480, fontSize: 12 }}>
      <div className="dim" style={{ fontSize: 11 }}>
        {selected.size} of {all.length} groups assigned
      </div>
      <div
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: 4,
          background: "var(--color-bg-2)",
          padding: 10,
          display: "grid",
          gap: 6,
          maxHeight: 320,
          overflow: "auto",
        }}
      >
        {all.length === 0 && <div className="dim">No groups defined.</div>}
        {all.map((g) => (
          <label key={g.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggle(g.id)} />
            <span className="mono">{g.name}</span>
            <span className="dim" style={{ fontSize: 10.5 }}>
              · {g.permission_count} perms
            </span>
          </label>
        ))}
      </div>
      <button
        className="btn primary"
        disabled={!dirty || m.isPending}
        onClick={() => m.mutate()}
        style={{ alignSelf: "flex-start" }}
      >
        {m.isPending ? "Saving…" : "Save groups"}
      </button>
    </div>
  );
}
