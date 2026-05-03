import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/shared/Toast";
import { bulkDeleteGroups } from "@/lib/api/groups";
import { queryKeys } from "@/lib/query-keys";

interface Props {
  selected: Set<number>;
  names: Map<number, string>;
  onClear: () => void;
}

export function BulkDeleteBar({ selected, names, onClear }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const m = useMutation({
    mutationFn: bulkDeleteGroups,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: queryKeys.groups.all });
      const ok = r.success.length;
      const fail = r.failed.length;
      showToast(
        `${ok} group${ok === 1 ? "" : "s"} deleted${fail ? `, ${fail} failed` : ""}.`,
        fail ? "info" : "success",
      );
      onClear();
    },
    onError: () => showToast("Bulk delete failed.", "error"),
  });

  if (selected.size === 0) return null;

  function run() {
    const ids = [...selected];
    const list = ids.map((i) => names.get(i) ?? `#${i}`).join(", ");
    if (!window.confirm(`Delete ${ids.length} group(s): ${list}?\n\nThis cannot be undone. Members are kept; only group membership is severed.`)) return;
    m.mutate(ids);
  }

  return (
    <div
      style={{
        display: "flex", gap: 8, alignItems: "center",
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
      <button className="btn danger" onClick={run} disabled={m.isPending}>
        {m.isPending ? "Deleting…" : "Delete"}
      </button>
      <button className="btn ghost" onClick={onClear}>Clear</button>
    </div>
  );
}
