import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateMe, type UpdateMePayload } from "@/lib/api/me";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/components/shared/Toast";
import { queryKeys } from "@/lib/query-keys";
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

export function ProfileEditModal({ open, onOpenChange }: Props) {
  const me = useCurrentUser();
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [serverErr, setServerErr] = useState<Record<string, string[]> | string | null>(null);

  // Reset state every time the modal opens to discard any prior typing.
  useEffect(() => {
    if (open && me.data) {
      setFirstName((me.data as { first_name?: string }).first_name ?? "");
      setLastName((me.data as { last_name?: string }).last_name ?? "");
      setEmail(me.data.email ?? "");
      setServerErr(null);
    }
  }, [open, me.data]);

  const mutation = useMutation({
    mutationFn: (payload: UpdateMePayload) => updateMe(payload),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.me, data);
      showToast("Profile updated.", "success");
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const data = (err as { response?: { data?: unknown } })?.response?.data;
      if (data && typeof data === "object") {
        setServerErr(data as Record<string, string[]>);
      } else {
        setServerErr("Could not update profile. Please try again.");
      }
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setServerErr(null);
    const payload: UpdateMePayload = {};
    if (firstName !== ((me.data as { first_name?: string })?.first_name ?? ""))
      payload.first_name = firstName;
    if (lastName !== ((me.data as { last_name?: string })?.last_name ?? ""))
      payload.last_name = lastName;
    if (email !== (me.data?.email ?? "")) payload.email = email;
    if (Object.keys(payload).length === 0) {
      onOpenChange(false);
      return;
    }
    mutation.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogBody>
            <Field label="First name" id="first_name">
              <input
                id="first_name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                maxLength={150}
                style={inputStyle}
              />
              <FieldErr err={serverErr} field="first_name" />
            </Field>
            <Field label="Last name" id="last_name">
              <input
                id="last_name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                maxLength={150}
                style={inputStyle}
              />
              <FieldErr err={serverErr} field="last_name" />
            </Field>
            <Field label="Email" id="email">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
              <FieldErr err={serverErr} field="email" />
            </Field>
            {typeof serverErr === "string" && (
              <div style={errStyle}>{serverErr}</div>
            )}
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
              {mutation.isPending ? "Saving…" : "Save"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
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
