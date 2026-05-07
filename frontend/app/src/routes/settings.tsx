import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { PageHead } from "@/components/shared/PageHead";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/components/shared/Toast";
import { TokenFilterBar } from "@/components/tokens/TokenFilterBar";
import { TokenListTable } from "@/components/tokens/TokenListTable";
import { TokenRevealDialog } from "@/components/tokens/TokenRevealDialog";
import { AddTokenModal } from "@/components/tokens/AddTokenModal";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAdminTokensInfinite } from "@/hooks/useTokensAdmin";
import { revokeUserToken, type AdminTokenRow } from "@/lib/api/tokens";
import { queryKeys } from "@/lib/query-keys";

interface RevealState {
  username: string;
  tokenKey: string;
}

export default function SettingsRoute() {
  const me = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const { showToast } = useToast();

  const search = searchParams.get("search") ?? "";
  const filters = useMemo(() => ({ search, limit: 50 }), [search]);
  const q = useAdminTokensInfinite(filters);

  const rows: AdminTokenRow[] = useMemo(
    () => q.data?.pages.flatMap((p) => p.data) ?? [],
    [q.data],
  );
  const total = q.data?.pages[0]?.total ?? 0;

  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);

  const revokeM = useMutation({
    mutationFn: (userId: number) => revokeUserToken(userId),
    onMutate: (userId) => setPendingUserId(userId),
    onSuccess: (_data, userId) => {
      qc.invalidateQueries({ queryKey: queryKeys.tokens.adminAll });
      qc.invalidateQueries({ queryKey: queryKeys.tokens.user(userId) });
      qc.invalidateQueries({ queryKey: queryKeys.users.all });
      showToast("Token revoked.", "success");
    },
    onError: () => showToast("Revoke failed.", "error"),
    onSettled: () => setPendingUserId(null),
  });

  if (me.data && !me.data.is_superuser) {
    return (
      <div style={{ padding: 24, maxWidth: 480, margin: "40px auto" }}>
        <Alert variant="destructive">
          <AlertTitle>Forbidden</AlertTitle>
          <AlertDescription>Settings is restricted to superusers.</AlertDescription>
        </Alert>
      </div>
    );
  }

  function applyFilters(next: { search: string }) {
    const params = new URLSearchParams();
    if (next.search) params.set("search", next.search);
    setSearchParams(params, { replace: true });
  }

  function onRevoke(row: AdminTokenRow) {
    if (pendingUserId !== null) return;
    if (!window.confirm(`Revoke ${row.username}'s token?\n\nThis cannot be undone.`)) return;
    revokeM.mutate(row.user_id);
  }

  function onAddSuccess(username: string, tokenKey: string) {
    setAddOpen(false);
    setReveal({ username, tokenKey });
    qc.invalidateQueries({ queryKey: queryKeys.tokens.adminAll });
    qc.invalidateQueries({ queryKey: queryKeys.users.all });
  }

  return (
    <>
      <PageHead crumbs={["CAPE", "Admin", "Settings"]} />
      <div className="scroll" style={{ padding: 14 }}>
        <div className="panel">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <h2 className="panel-h" style={{ margin: 0 }}>
              API Tokens{" "}
              <span className="dim" style={{ fontSize: 11 }}>({total})</span>
            </h2>
            <button
              type="button"
              className="btn primary"
              onClick={() => setAddOpen(true)}
              style={{ display: "flex", gap: 4, alignItems: "center" }}
            >
              <Plus size={14} /> Add Token
            </button>
          </div>
          <div style={{ padding: 12, display: "grid", gap: 12 }}>
            <TokenFilterBar initialSearch={search} onApply={applyFilters} />
            {q.isLoading ? (
              <div style={{ padding: 24 }}>
                <Spinner size={14} />
              </div>
            ) : q.isError ? (
              <Alert variant="destructive">
                <AlertTitle>Failed to load tokens</AlertTitle>
                <AlertDescription>{String(q.error)}</AlertDescription>
              </Alert>
            ) : (
              <TokenListTable
                rows={rows}
                onRevoke={onRevoke}
                pendingUserId={pendingUserId}
              />
            )}
            {q.hasNextPage && (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={q.isFetchingNextPage}
                  onClick={() => q.fetchNextPage()}
                >
                  {q.isFetchingNextPage ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {addOpen && (
        <AddTokenModal
          onClose={() => setAddOpen(false)}
          onSuccess={onAddSuccess}
        />
      )}
      {reveal && (
        <TokenRevealDialog
          username={reveal.username}
          tokenKey={reveal.tokenKey}
          onClose={() => setReveal(null)}
        />
      )}
    </>
  );
}
