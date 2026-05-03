import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import { PageHead } from "@/components/shared/PageHead";
import { PermissionsPicker } from "@/components/users/PermissionsPicker";
import { Spinner } from "@/components/ui/spinner";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useGroupDetail } from "@/hooks/useGroups";
import { useToast } from "@/components/shared/Toast";
import {
  deleteGroup,
  updateGroup,
  type GroupDetail,
} from "@/lib/api/groups";
import { queryKeys } from "@/lib/query-keys";

const TABS = ["Basic", "Members"] as const;
type TabKey = (typeof TABS)[number];

const inputStyle: React.CSSProperties = {
  height: 28, padding: "0 8px", fontSize: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-bg-2)", color: "var(--color-fg-0)",
  borderRadius: 3,
};

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%", padding: 32 }}>
      {children}
    </div>
  );
}

export default function GroupsDetailRoute() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const navigate = useNavigate();
  const me = useCurrentUser();
  const groupQ = useGroupDetail(id);
  const [tab, setTab] = useState<TabKey>("Basic");

  if (me.isLoading || groupQ.isLoading) return <Centered><Spinner size={14} /></Centered>;
  if (!me.data?.is_staff) {
    navigate("/", { replace: true });
    return null;
  }
  if (groupQ.error || !groupQ.data) {
    return <Centered><div className="dim">Group not found.</div></Centered>;
  }

  const group = groupQ.data;

  return (
    <>
      <PageHead crumbs={["CAPE", "Admin", "Groups", group.name]} />
      <div className="scroll" style={{ padding: 14 }}>
        <div className="panel">
          <div
            style={{
              padding: "0 14px",
              borderBottom: "1px solid var(--color-border)",
              display: "flex", gap: 4,
            }}
          >
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: "transparent", border: 0,
                  borderBottom: tab === t ? "2px solid var(--color-accent-strong)" : "2px solid transparent",
                  padding: "10px 12px", fontSize: 12,
                  color: tab === t ? "var(--color-fg-0)" : "var(--color-fg-2)",
                  cursor: "pointer",
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <div style={{ padding: 14 }}>
            {tab === "Basic" && <BasicTab group={group} />}
            {tab === "Members" && <MembersPlaceholder group={group} />}
          </div>
        </div>
      </div>
    </>
  );
}

function BasicTab({ group }: { group: GroupDetail }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [name, setName] = useState(group.name);
  const [permissionIds, setPermissionIds] = useState<number[]>(group.permission_ids);

  useEffect(() => {
    setName(group.name);
    setPermissionIds(group.permission_ids);
  }, [group.id, group.name, group.permission_ids]);

  const dirty = useMemo(() => {
    if (name !== group.name) return true;
    const a = new Set(group.permission_ids);
    if (a.size !== permissionIds.length) return true;
    for (const id of permissionIds) if (!a.has(id)) return true;
    return false;
  }, [name, permissionIds, group.name, group.permission_ids]);

  const update = useMutation({
    mutationFn: () => {
      const payload: { name?: string; permission_ids?: number[] } = {};
      if (name !== group.name) payload.name = name;
      const a = new Set(group.permission_ids);
      const same = a.size === permissionIds.length && permissionIds.every((p) => a.has(p));
      if (!same) payload.permission_ids = permissionIds;
      return updateGroup(group.id, payload);
    },
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.groups.detail(group.id), data);
      qc.invalidateQueries({ queryKey: queryKeys.groups.all });
      showToast("Group saved.", "success");
    },
    onError: (e: unknown) => {
      const data = (e as { response?: { data?: unknown } })?.response?.data;
      if (data && typeof data === "object" && "name" in data) {
        const msg = (data as { name: string[] }).name;
        showToast(Array.isArray(msg) ? msg.join(" ") : String(msg), "error");
      } else {
        showToast("Save failed.", "error");
      }
    },
  });

  const del = useMutation({
    mutationFn: () => deleteGroup(group.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.groups.all });
      showToast(`Deleted ${group.name}.`, "success");
      navigate("/groups");
    },
    onError: () => showToast("Delete failed.", "error"),
  });

  function confirmDelete() {
    if (
      !window.confirm(
        `Delete group "${group.name}"? ${group.member_count} member(s) will be removed from this group.\n\nThis cannot be undone.`,
      )
    )
      return;
    del.mutate();
  }

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 640, fontSize: 12 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <label style={{ fontSize: 11, color: "var(--color-fg-1)" }}>Name *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
          maxLength={150}
          required
        />
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        <label style={{ fontSize: 11, color: "var(--color-fg-1)" }}>Permissions</label>
        <PermissionsPicker
          value={permissionIds}
          onChange={setPermissionIds}
          disabled={update.isPending}
        />
      </div>
      <div className="dim" style={{ fontSize: 11 }}>
        {group.member_count} member(s)
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn primary"
          disabled={!dirty || update.isPending}
          onClick={() => update.mutate()}
        >
          {update.isPending ? "Saving…" : "Save"}
        </button>
        <div style={{ flex: 1 }} />
        <button
          className="btn danger"
          onClick={confirmDelete}
          disabled={del.isPending}
        >
          {del.isPending ? "Deleting…" : "Delete group"}
        </button>
      </div>
    </div>
  );
}

function MembersPlaceholder({ group: _group }: { group: GroupDetail }) {
  return (
    <div className="dim mono">
      [Members tab — implemented in Phase I; UsersInGroupPicker coming]
    </div>
  );
}
