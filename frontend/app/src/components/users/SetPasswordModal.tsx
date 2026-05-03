import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { useToast } from "@/components/shared/Toast";
import { setUserPassword } from "@/lib/api/users";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number;
  username: string;
}

export function SetPasswordModal({ open, onOpenChange, userId, username }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (open) {
      setPassword("");
      setConfirm("");
      setErr(null);
    }
  }, [open]);

  const m = useMutation({
    mutationFn: () => setUserPassword(userId, password),
    onSuccess: () => {
      showToast(`Password reset for ${username}.`, "success");
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      const data = (e as { response?: { data?: unknown } })?.response?.data;
      if (typeof data === "object" && data && "password" in data) {
        setErr(String((data as { password: string[] }).password.join(" ")));
      } else {
        setErr("Could not reset password. Please try again.");
      }
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    setErr(null);
    m.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set password for {username}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogBody>
            <div style={{ display: "grid", gap: 4 }}>
              <label style={{ fontSize: 11, color: "var(--color-fg-1)" }} htmlFor="pw1">
                New password
              </label>
              <input
                id="pw1"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div style={{ display: "grid", gap: 4 }}>
              <label style={{ fontSize: 11, color: "var(--color-fg-1)" }} htmlFor="pw2">
                Confirm
              </label>
              <input
                id="pw2"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            {err && (
              <div style={{ fontSize: 11, color: "var(--color-sev-crit, #ff7b72)" }}>{err}</div>
            )}
          </DialogBody>
          <DialogFooter>
            <button type="button" className="btn" onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={m.isPending}>
              {m.isPending ? "Setting…" : "Set password"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const inputStyle: React.CSSProperties = {
  height: 28,
  padding: "0 8px",
  fontSize: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-bg-2)",
  color: "var(--color-fg-0)",
  borderRadius: 3,
};
