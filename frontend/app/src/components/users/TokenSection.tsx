import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/shared/Toast";
import {
  getMyToken,
  getUserToken,
  revokeMyToken,
  revokeUserToken,
  rotateMyToken,
  rotateUserToken,
  type TokenInfo,
} from "@/lib/api/tokens";
import { queryKeys } from "@/lib/query-keys";

interface Props {
  /** undefined = self-service (uses /me/token/), number = admin manages a specific user. */
  userId?: number;
  username?: string;
}

export function TokenSection({ userId, username }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const isAdminScope = userId !== undefined;

  const queryKey = isAdminScope ? queryKeys.tokens.user(userId) : queryKeys.tokens.me;
  const queryFn = () => (isAdminScope ? getUserToken(userId) : getMyToken());

  const tokenQ = useQuery({ queryKey, queryFn });

  const [reveal, setReveal] = useState(false);
  const [justRotated, setJustRotated] = useState<string | null>(null);

  const rotate = useMutation({
    mutationFn: () => (isAdminScope ? rotateUserToken(userId) : rotateMyToken()),
    onSuccess: (data: TokenInfo) => {
      qc.setQueryData(queryKey, data);
      setJustRotated(data.key);
      setReveal(true);
      showToast(`Token ${data.key ? "generated/rotated" : "saved"}.`, "success");
    },
    onError: () => showToast("Token operation failed.", "error"),
  });

  const revoke = useMutation({
    mutationFn: () => (isAdminScope ? revokeUserToken(userId) : revokeMyToken()),
    onSuccess: () => {
      qc.setQueryData(queryKey, { key: null, created: null });
      setJustRotated(null);
      setReveal(false);
      showToast("Token revoked.", "success");
    },
    onError: () => showToast("Revoke failed.", "error"),
  });

  if (tokenQ.isLoading) return <div className="dim mono">Loading token…</div>;
  const tok = tokenQ.data;
  const hasToken = !!tok?.key;

  return (
    <div style={{ display: "grid", gap: 10, maxWidth: 540, fontSize: 12 }}>
      <div>
        <strong>Status:</strong> {hasToken ? "✅ Active" : "⊘ No token"}
      </div>
      {hasToken && tok && (
        <>
          <div className="dim" style={{ fontSize: 11 }}>
            Created: {tok.created ?? "—"}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <code
              className="mono"
              style={{
                padding: "5px 8px",
                background: "var(--color-bg-2)",
                border: "1px solid var(--color-border)",
                borderRadius: 3,
                fontSize: 11,
                flex: 1,
                wordBreak: "break-all",
              }}
            >
              {reveal ? tok.key : "●".repeat(40)}
            </code>
            <button type="button" className="btn ghost" onClick={() => setReveal((r) => !r)}>
              {reveal ? "Hide" : "Reveal"}
            </button>
            {reveal && tok.key && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => navigator.clipboard.writeText(tok.key!)}
              >
                Copy
              </button>
            )}
          </div>
        </>
      )}

      {justRotated && (
        <div
          style={{
            padding: 8,
            fontSize: 11,
            background: "#23863622",
            color: "#7ee787",
            border: "1px solid #7ee78733",
            borderRadius: 3,
          }}
        >
          New token displayed above. Save it — it will be masked next time you load this page.
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            if (
              hasToken &&
              !window.confirm(
                `Rotate ${username ?? "your"} token? Existing key will stop working immediately.`,
              )
            )
              return;
            rotate.mutate();
          }}
          disabled={rotate.isPending}
        >
          {rotate.isPending ? "…" : hasToken ? "Rotate" : "Generate token"}
        </button>
        {hasToken && (
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              if (!window.confirm("Revoke token? This cannot be undone.")) return;
              revoke.mutate();
            }}
            disabled={revoke.isPending}
          >
            {revoke.isPending ? "…" : "Revoke"}
          </button>
        )}
      </div>
    </div>
  );
}
