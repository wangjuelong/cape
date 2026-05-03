import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/shared/Toast";
import { bulkAction, type BulkActionResponse } from "@/lib/api/users";
import { queryKeys } from "@/lib/query-keys";

interface Props {
  selected: Set<number>;
  usernames: Map<number, string>;
  onClear: () => void;
}

export function BulkActionBar({ selected, usernames, onClear }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const m = useMutation({
    mutationFn: bulkAction,
    onSuccess: (r: BulkActionResponse) => {
      qc.invalidateQueries({ queryKey: queryKeys.users.all });
      const ok = r.success.length;
      const fail = r.failed.length;
      showToast(`${ok} succeeded${fail ? `, ${fail} failed` : ""}.`, fail ? "info" : "success");
      onClear();
    },
    onError: () => showToast("Bulk action failed.", "error"),
  });

  if (selected.size === 0) return null;

  function run(action: "activate" | "deactivate" | "delete") {
    const ids = Array.from(selected);
    if (action === "delete") {
      const names = ids.map((i) => usernames.get(i) ?? `#${i}`).join(", ");
      if (!window.confirm(`Delete ${ids.length} users: ${names}?\n\nThis cannot be undone.`)) {
        return;
      }
    }
    m.mutate({ ids, action });
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        padding: "8px 12px",
        background: "var(--color-bg-2)",
        border: "1px solid var(--color-border)",
        borderRadius: 4,
      }}
    >
      <span className="dim" style={{ fontSize: 12 }}>
        {selected.size} selected
      </span>
      <div style={{ flex: 1 }} />
      <button type="button" className="btn" onClick={() => run("activate")} disabled={m.isPending}>
        Activate
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => run("deactivate")}
        disabled={m.isPending}
      >
        Deactivate
      </button>
      <button
        type="button"
        className="btn danger"
        onClick={() => run("delete")}
        disabled={m.isPending}
      >
        Delete
      </button>
      <button type="button" className="btn ghost" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
