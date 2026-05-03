import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { PageHead } from "@/components/shared/PageHead";
import { PermissionsPicker } from "@/components/users/PermissionsPicker";
import { Spinner } from "@/components/ui/spinner";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/components/shared/Toast";
import { createGroup, type GroupCreatePayload } from "@/lib/api/groups";
import { queryKeys } from "@/lib/query-keys";

const inputStyle: React.CSSProperties = {
  height: 28, padding: "0 8px", fontSize: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-bg-2)", color: "var(--color-fg-0)",
  borderRadius: 3,
};

export default function GroupsNewRoute() {
  const me = useCurrentUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [permissionIds, setPermissionIds] = useState<number[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: (p: GroupCreatePayload) => createGroup(p),
    onSuccess: (group) => {
      qc.invalidateQueries({ queryKey: queryKeys.groups.all });
      showToast(`Created group ${group.name}.`, "success");
      navigate(`/groups/${group.id}`);
    },
    onError: (e: unknown) => {
      const data = (e as { response?: { data?: unknown } })?.response?.data;
      if (data && typeof data === "object" && "name" in data) {
        const msg = (data as { name: string[] }).name;
        setErr(Array.isArray(msg) ? msg.join(" ") : String(msg));
      } else setErr("Create failed.");
    },
  });

  if (me.isLoading) return <div style={{ display: "grid", placeItems: "center", height: "100%" }}><Spinner size={14} /></div>;
  if (!me.data?.is_staff) {
    navigate("/", { replace: true });
    return null;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) {
      setErr("Name is required.");
      return;
    }
    m.mutate({ name: name.trim(), permission_ids: permissionIds });
  }

  return (
    <>
      <PageHead crumbs={["CAPE", "Admin", "Groups", "New"]} />
      <div className="scroll" style={{ padding: 14 }}>
        <div className="panel" style={{ maxWidth: 640 }}>
          <div className="panel-h">New group</div>
          <form onSubmit={submit} style={{ padding: 14, display: "grid", gap: 12, fontSize: 12 }}>
            <div style={{ display: "grid", gap: 4 }}>
              <label style={{ fontSize: 11, color: "var(--color-fg-1)" }}>Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
                maxLength={150}
                required
                autoFocus
              />
            </div>
            <div style={{ display: "grid", gap: 4 }}>
              <label style={{ fontSize: 11, color: "var(--color-fg-1)" }}>
                Permissions (optional — group can be configured later)
              </label>
              <PermissionsPicker
                value={permissionIds}
                onChange={setPermissionIds}
                disabled={m.isPending}
              />
            </div>
            {err && (
              <div style={{ fontSize: 11, color: "var(--color-sev-crit, #ff7b72)" }}>{err}</div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn"
                onClick={() => navigate("/groups")}
                disabled={m.isPending}
              >
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={m.isPending}>
                {m.isPending ? "Creating…" : "Create group"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
