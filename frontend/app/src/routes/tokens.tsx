import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { PageHead } from "@/components/shared/PageHead";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/components/shared/Toast";
import { TokenFilterBar } from "@/components/tokens/TokenFilterBar";
import { TokenListTable } from "@/components/tokens/TokenListTable";
import { TokenRevealDialog } from "@/components/tokens/TokenRevealDialog";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAdminTokensInfinite } from "@/hooks/useTokensAdmin";
import {
  rotateUserToken,
  revokeUserToken,
  type AdminTokenRow,
} from "@/lib/api/tokens";
import { queryKeys } from "@/lib/query-keys";

interface RevealState {
  username: string;
  tokenKey: string;
}

export default function TokensRoute() {
  const me = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const { showToast } = useToast();

  const search = searchParams.get("search") ?? "";
  const hasTokenParam = (searchParams.get("has_token") ?? "all") as
    | "all"
    | "yes"
    | "no";

  const filters = useMemo(
    () => ({ search, has_token: hasTokenParam, limit: 50 }),
    [search, hasTokenParam],
  );

  const q = useAdminTokensInfinite(filters);

  const rows: AdminTokenRow[] = useMemo(
    () => q.data?.pages.flatMap((p) => p.data) ?? [],
    [q.data],
  );
  const total = q.data?.pages[0]?.total ?? 0;

  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);

  const rotateM = useMutation({
    mutationFn: (userId: number) => rotateUserToken(userId),
    onMutate: (userId) => setPendingUserId(userId),
    onSuccess: (data, userId) => {
      const username =
        rows.find((r) => r.user_id === userId)?.username ?? `user #${userId}`;
      if (data.key) {
        setReveal({ username, tokenKey: data.key });
      }
      qc.invalidateQueries({ queryKey: queryKeys.tokens.adminAll });
      qc.invalidateQueries({ queryKey: queryKeys.tokens.user(userId) });
      showToast(`Token ${data.key ? "saved" : "rotated"} for ${username}.`, "success");
    },
    onError: () => showToast("Token operation failed.", "error"),
    onSettled: () => setPendingUserId(null),
  });

  const revokeM = useMutation({
    mutationFn: (userId: number) => revokeUserToken(userId),
    onMutate: (userId) => setPendingUserId(userId),
    onSuccess: (_data, userId) => {
      qc.invalidateQueries({ queryKey: queryKeys.tokens.adminAll });
      qc.invalidateQueries({ queryKey: queryKeys.tokens.user(userId) });
      showToast("Token revoked.", "success");
    },
    onError: () => showToast("Revoke failed.", "error"),
    onSettled: () => setPendingUserId(null),
  });

  if (me.data && !me.data.is_staff) {
    return (
      <div style={{ padding: 24, maxWidth: 480, margin: "40px auto" }}>
        <Alert variant="destructive">
          <AlertTitle>Forbidden</AlertTitle>
          <AlertDescription>
            Token administration is restricted to staff users.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  function applyFilters(next: { search: string; has_token: "all" | "yes" | "no" }) {
    const params = new URLSearchParams();
    if (next.search) params.set("search", next.search);
    if (next.has_token !== "all") params.set("has_token", next.has_token);
    setSearchParams(params, { replace: true });
  }

  function onGenerate(row: AdminTokenRow) {
    if (!window.confirm(`Generate API token for ${row.username}?`)) return;
    rotateM.mutate(row.user_id);
  }

  function onRotate(row: AdminTokenRow) {
    if (
      !window.confirm(
        `Rotate token for ${row.username}?\n\nExisting key will stop working immediately.`,
      )
    )
      return;
    rotateM.mutate(row.user_id);
  }

  function onRevoke(row: AdminTokenRow) {
    if (
      !window.confirm(
        `Revoke ${row.username}'s token? This cannot be undone.`,
      )
    )
      return;
    revokeM.mutate(row.user_id);
  }

  return (
    <>
      <PageHead crumbs={["CAPE", "Admin", "Tokens"]} />
      <div className="scroll" style={{ padding: 14 }}>
        <div className="panel">
          <h2 className="panel-h" style={{ margin: 0 }}>
            Tokens <span className="dim" style={{ fontSize: 11 }}>({total})</span>
          </h2>
          <div style={{ padding: 12, display: "grid", gap: 12 }}>
            <TokenFilterBar
              initialSearch={search}
              initialHasToken={hasTokenParam}
              onApply={applyFilters}
            />
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
                onGenerate={onGenerate}
                onRotate={onRotate}
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
