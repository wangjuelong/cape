import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
} from "@/components/ui/dialog";
import { listUsers } from "@/lib/api/users";
import { rotateUserToken } from "@/lib/api/tokens";

interface Props {
  onClose: () => void;
  onSuccess: (username: string, tokenKey: string) => void;
}

export function AddTokenModal({ onClose, onSuccess }: Props) {
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const usersQ = useQuery({
    queryKey: ["users", "no-token"],
    queryFn: () => listUsers({ has_token: "no", limit: 200 }),
  });

  const m = useMutation({
    mutationFn: (userId: number) => rotateUserToken(userId),
    onSuccess: (data, userId) => {
      const user = usersQ.data?.data.find((u) => u.id === userId);
      if (data.key && user) onSuccess(user.username, data.key);
    },
    onError: (err) => setErrorMsg(String(err)),
  });

  useEffect(() => {
    setErrorMsg(null);
  }, [selectedId]);

  const candidates = usersQ.data?.data ?? [];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent width={420}>
        <DialogHeader>
          <strong>Add API Token</strong>
        </DialogHeader>
        <div style={{ padding: 14, display: "grid", gap: 10, fontSize: 12 }}>
          <div className="dim">
            Generate a new API token for a user. The user must not already have one.
          </div>
          <label style={{ display: "grid", gap: 4 }}>
            <span>User</span>
            <select
              value={selectedId === "" ? "" : String(selectedId)}
              onChange={(e) =>
                setSelectedId(e.target.value ? Number(e.target.value) : "")
              }
              disabled={usersQ.isLoading || m.isPending}
            >
              <option value="">— select a user —</option>
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                </option>
              ))}
            </select>
          </label>
          {usersQ.isLoading && <div className="dim">Loading users…</div>}
          {!usersQ.isLoading && candidates.length === 0 && (
            <div className="dim">All users already have tokens.</div>
          )}
          {errorMsg && (
            <div style={{ color: "var(--color-danger)" }}>{errorMsg}</div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <DialogClose asChild>
              <button type="button" className="btn ghost">Cancel</button>
            </DialogClose>
            <button
              type="button"
              className="btn primary"
              disabled={selectedId === "" || m.isPending}
              onClick={() => {
                if (selectedId !== "") m.mutate(selectedId);
              }}
            >
              {m.isPending ? "Generating…" : "Generate"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
