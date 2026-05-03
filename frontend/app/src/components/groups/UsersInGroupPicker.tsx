import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/shared/Toast";
import { setGroupMembers } from "@/lib/api/groups";
import { useGroupMembers } from "@/hooks/useGroups";
import { listUsers } from "@/lib/api/users";
import { queryKeys } from "@/lib/query-keys";

interface Props {
  groupId: number;
  groupName: string;
}

const inputStyle: React.CSSProperties = {
  height: 28, padding: "0 8px", fontSize: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-bg-2)", color: "var(--color-fg-0)",
  borderRadius: 3,
};

export function UsersInGroupPicker({ groupId, groupName }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const membersQ = useGroupMembers(groupId);
  const allUsersQ = useQuery({
    queryKey: ["users", "all-for-picker"],
    queryFn: () => listUsers({ limit: 200 }),
    staleTime: 30_000,
  });

  const [memberIds, setMemberIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (membersQ.data) {
      setMemberIds(new Set(membersQ.data.data.map((u) => u.id)));
    }
  }, [membersQ.data]);

  const memberRows = useMemo(() => membersQ.data?.data ?? [], [membersQ.data]);
  const allUsers = useMemo(() => allUsersQ.data?.data ?? [], [allUsersQ.data]);

  const filteredAll = useMemo(() => {
    if (!search) return allUsers;
    const q = search.toLowerCase();
    return allUsers.filter(
      (u) =>
        u.username.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q),
    );
  }, [allUsers, search]);

  const inGroup = useMemo(() => filteredAll.filter((u) => memberIds.has(u.id)), [
    filteredAll,
    memberIds,
  ]);
  const outOfGroup = useMemo(
    () => filteredAll.filter((u) => !memberIds.has(u.id)),
    [filteredAll, memberIds],
  );

  function add(id: number) {
    setMemberIds((prev) => new Set(prev).add(id));
  }
  function remove(id: number) {
    setMemberIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }
  function addAll() {
    setMemberIds((prev) => {
      const next = new Set(prev);
      for (const u of outOfGroup) next.add(u.id);
      return next;
    });
  }
  function removeAll() {
    setMemberIds((prev) => {
      const next = new Set(prev);
      for (const u of inGroup) next.delete(u.id);
      return next;
    });
  }

  const dirty = useMemo(() => {
    const original = new Set(memberRows.map((u) => u.id));
    if (original.size !== memberIds.size) return true;
    for (const id of memberIds) if (!original.has(id)) return true;
    return false;
  }, [memberIds, memberRows]);

  const m = useMutation({
    mutationFn: () => setGroupMembers(groupId, [...memberIds]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.groups.members(groupId) });
      qc.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId) });
      qc.invalidateQueries({ queryKey: queryKeys.groups.all });
      showToast(`Members for ${groupName} saved.`, "success");
    },
    onError: () => showToast("Save failed.", "error"),
  });

  if (membersQ.isLoading || allUsersQ.isLoading) {
    return <div className="dim mono">Loading users…</div>;
  }

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 760, fontSize: 12 }}>
      <input
        style={{ ...inputStyle, width: 320 }}
        placeholder="Search users by username or email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 1fr", gap: 12, alignItems: "stretch" }}>
        <ColumnList
          title={`In group (${inGroup.length})`}
          rows={inGroup}
          onPick={remove}
          pickLabel="Remove"
        />
        <div style={{ display: "grid", placeItems: "center", gap: 6 }}>
          <button className="btn" onClick={addAll} disabled={outOfGroup.length === 0}>{`<< all`}</button>
          <button className="btn" onClick={removeAll} disabled={inGroup.length === 0}>{`all >>`}</button>
        </div>
        <ColumnList
          title={`Available (${outOfGroup.length})`}
          rows={outOfGroup}
          onPick={add}
          pickLabel="Add"
        />
      </div>
      <button
        className="btn primary"
        disabled={!dirty || m.isPending}
        onClick={() => m.mutate()}
        style={{ alignSelf: "flex-start" }}
      >
        {m.isPending ? "Saving…" : "Save members"}
      </button>
    </div>
  );
}

interface ColumnRow {
  id: number;
  username: string;
  email: string;
}

function ColumnList({
  title,
  rows,
  onPick,
  pickLabel,
}: {
  title: string;
  rows: ColumnRow[];
  onPick: (id: number) => void;
  pickLabel: string;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 4,
        background: "var(--color-bg-2)",
        display: "flex", flexDirection: "column", maxHeight: 380, minHeight: 200,
      }}
    >
      <div className="panel-h" style={{ fontSize: 11.5, padding: "6px 10px" }}>
        {title}
      </div>
      <div style={{ overflow: "auto", flex: 1, padding: 4 }}>
        {rows.length === 0 && (
          <div className="dim mono" style={{ padding: 8, fontSize: 10.5 }}>
            (none)
          </div>
        )}
        {rows.map((u) => (
          <div
            key={u.id}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "4px 8px",
            }}
          >
            <div style={{ flex: 1, display: "grid", gap: 1 }}>
              <span className="mono" style={{ fontSize: 11 }}>{u.username}</span>
              {u.email && (
                <span className="dim mono" style={{ fontSize: 9.5 }}>{u.email}</span>
              )}
            </div>
            <button
              className="btn ghost"
              onClick={() => onPick(u.id)}
              style={{ height: 22, padding: "0 8px", fontSize: 10.5 }}
            >
              {pickLabel}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
