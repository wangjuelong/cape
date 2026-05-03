import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { changePassword, type ChangePasswordPayload } from "@/lib/api/me";
import { useToast } from "@/components/shared/Toast";
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
}

export function PasswordChangeModal({ open, onOpenChange }: Props) {
  const { showToast } = useToast();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [serverErr, setServerErr] = useState<Record<string, string[]> | string | null>(null);
  const [clientErr, setClientErr] = useState<string | null>(null);

  // Wipe state every time the modal opens — passwords MUST NOT linger.
  useEffect(() => {
    if (open) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setServerErr(null);
      setClientErr(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: (payload: ChangePasswordPayload) => changePassword(payload),
    onSuccess: () => {
      showToast("Password changed.", "success");
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const data = (err as { response?: { data?: unknown } })?.response?.data;
      if (data && typeof data === "object") {
        setServerErr(data as Record<string, string[]>);
      } else {
        setServerErr("Could not change password. Please try again.");
      }
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setServerErr(null);
    setClientErr(null);
    if (next !== confirm) {
      setClientErr("New password and confirmation do not match.");
      return;
    }
    if (next.length < 8) {
      setClientErr("New password must be at least 8 characters.");
      return;
    }
    mutation.mutate({
      current_password: current,
      new_password: next,
      confirm_password: confirm,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogBody>
            <Field label="Current password" id="cur_pw">
              <input
                id="cur_pw"
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                style={inputStyle}
                required
              />
              <FieldErr err={serverErr} field="current_password" />
            </Field>
            <Field label="New password (≥8 chars)" id="new_pw">
              <input
                id="new_pw"
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                style={inputStyle}
                required
              />
              <FieldErr err={serverErr} field="new_password" />
            </Field>
            <Field label="Confirm new password" id="confirm_pw">
              <input
                id="confirm_pw"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                style={inputStyle}
                required
              />
              <FieldErr err={serverErr} field="confirm_password" />
            </Field>
            {clientErr && <div style={errStyle}>{clientErr}</div>}
            {typeof serverErr === "string" && <div style={errStyle}>{serverErr}</div>}
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              className="btn"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={mutation.isPending}>
              {mutation.isPending ? "Updating…" : "Update password"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <label htmlFor={id} style={{ fontSize: 11, color: "var(--color-fg-1)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function FieldErr({
  err,
  field,
}: {
  err: Record<string, string[]> | string | null;
  field: string;
}) {
  if (!err || typeof err === "string") return null;
  const msg = err[field];
  if (!msg || !msg.length) return null;
  return <div style={errStyle}>{msg.join(" ")}</div>;
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

const errStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--color-sev-crit, #ff7b72)",
};
