import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { PageHead } from "@/components/shared/PageHead";
import { Spinner } from "@/components/ui/spinner";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/components/shared/Toast";
import { createUser, type UserCreatePayload } from "@/lib/api/users";
import { queryKeys } from "@/lib/query-keys";

export default function UsersNewRoute() {
  const me = useCurrentUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isStaff, setIsStaff] = useState(false);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: (p: UserCreatePayload) => createUser(p),
    onSuccess: (user) => {
      qc.invalidateQueries({ queryKey: queryKeys.users.all });
      showToast(`Created ${user.username}.`, "success");
      navigate(`/users/${user.id}`);
    },
    onError: (e: unknown) => {
      const data = (e as { response?: { data?: unknown } })?.response?.data;
      if (data && typeof data === "object") {
        setErr(JSON.stringify(data));
      } else {
        setErr("Create failed.");
      }
    },
  });

  if (me.isLoading) {
    return (
      <Centered>
        <Spinner size={14} />
      </Centered>
    );
  }
  if (!me.data?.is_staff) {
    navigate("/", { replace: true });
    return null;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    m.mutate({
      username,
      password,
      email,
      first_name: firstName,
      last_name: lastName,
      is_staff: isStaff,
      is_superuser: isSuperuser,
    });
  }

  const meIsSuper = me.data?.is_superuser ?? false;

  return (
    <>
      <PageHead crumbs={["CAPE", "Admin", "Users", "New"]} />
      <div className="scroll" style={{ padding: 14 }}>
        <div className="panel" style={{ maxWidth: 520 }}>
          <div className="panel-h">Add user</div>
          <form
            onSubmit={submit}
            style={{ padding: 14, display: "grid", gap: 10, fontSize: 12 }}
          >
            <Field label="Username *">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                style={inputStyle}
              />
            </Field>
            <Field label="Initial password *">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                style={inputStyle}
              />
            </Field>
            <Field label="Confirm *">
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                style={inputStyle}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="First name">
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Last name">
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Toggle label="is_staff" checked={isStaff} onChange={setIsStaff} />
            {meIsSuper && (
              <Toggle label="is_superuser" checked={isSuperuser} onChange={setIsSuperuser} />
            )}
            {err && (
              <div style={{ fontSize: 11, color: "var(--color-sev-crit, #ff7b72)" }}>{err}</div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn" onClick={() => navigate("/users")}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={m.isPending}>
                {m.isPending ? "Creating…" : "Create user"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <label style={{ fontSize: 11, color: "var(--color-fg-1)" }}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
        fontSize: 12,
        color: "var(--color-fg-2)",
      }}
    >
      {children}
    </div>
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
