import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { PageHead } from "@/components/shared/PageHead";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/components/shared/Toast";
import { SetPasswordModal } from "@/components/users/SetPasswordModal";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUserDetail } from "@/hooks/useUsers";
import { deleteUser, updateUser, type UserDetail } from "@/lib/api/users";
import { queryKeys } from "@/lib/query-keys";

const inputStyle: React.CSSProperties = {
  padding: "5px 8px",
  background: "var(--color-bg-2)",
  border: "1px solid var(--color-border)",
  borderRadius: 3,
  fontSize: 12,
  width: "100%",
};

const inputStyleRO: React.CSSProperties = { ...inputStyle, opacity: 0.6 };

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 11, color: "var(--color-fg-2)", marginBottom: 3 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Toggle({
  label, checked, onChange, disabled,
}: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      {label}
    </label>
  );
}

export default function UsersDetailRoute() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const navigate = useNavigate();
  const me = useCurrentUser();
  const userQ = useUserDetail(id);

  if (me.isLoading || userQ.isLoading) {
    return <Centered><Spinner size={14} /></Centered>;
  }
  if (!me.data?.is_superuser) {
    navigate("/", { replace: true });
    return null;
  }
  if (userQ.error || !userQ.data) {
    return (
      <div style={{ padding: 24, maxWidth: 480, margin: "40px auto" }}>
        <Alert variant="destructive">
          <AlertTitle>User not found</AlertTitle>
          <AlertDescription>{userQ.error ? String(userQ.error) : "Unknown user"}</AlertDescription>
        </Alert>
      </div>
    );
  }
  return <Page user={userQ.data} />;
}

function Page({ user }: { user: UserDetail }) {
  const me = useCurrentUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const isSelf = me.data?.username === user.username;
  const meIsSuper = !!me.data?.is_superuser;

  const [email, setEmail] = useState(user.email);
  const [firstName, setFirstName] = useState(user.first_name);
  const [lastName, setLastName] = useState(user.last_name);
  const [isActive, setIsActive] = useState(user.is_active);
  const [isSuper, setIsSuper] = useState(user.is_superuser);
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => {
    setEmail(user.email);
    setFirstName(user.first_name);
    setLastName(user.last_name);
    setIsActive(user.is_active);
    setIsSuper(user.is_superuser);
  }, [user]);

  const update = useMutation({
    mutationFn: () =>
      updateUser(user.id, {
        email,
        first_name: firstName,
        last_name: lastName,
        is_active: isActive,
        is_superuser: isSuper,
      }),
    onSuccess: () => {
      showToast("User updated.", "success");
      qc.invalidateQueries({ queryKey: queryKeys.users.detail(user.id) });
      qc.invalidateQueries({ queryKey: queryKeys.users.all });
    },
    onError: () => showToast("Update failed.", "error"),
  });

  const del = useMutation({
    mutationFn: () => deleteUser(user.id),
    onSuccess: () => {
      showToast(`Deleted ${user.username}.`, "success");
      qc.invalidateQueries({ queryKey: queryKeys.users.all });
      navigate("/users");
    },
    onError: () => showToast("Delete failed.", "error"),
  });

  function confirmDelete() {
    if (!window.confirm(`Delete user ${user.username}? This cannot be undone.`)) return;
    del.mutate();
  }

  return (
    <>
      <PageHead crumbs={["CAPE", "Admin", "Users", user.username]} />
      <div className="scroll" style={{ padding: 14 }}>
        <div className="panel" style={{ maxWidth: 540 }}>
          <h2 className="panel-h" style={{ margin: 0 }}>{user.username}</h2>
          <div style={{ padding: 14, display: "grid", gap: 10 }}>
            <Field label="Username (read-only)">
              <input readOnly value={user.username} style={inputStyleRO} />
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
            <Toggle label="Active" checked={isActive} onChange={setIsActive} disabled={isSelf} />
            {meIsSuper && (
              <Toggle label="Superuser" checked={isSuper} onChange={setIsSuper} />
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                className="btn primary"
                onClick={() => update.mutate()}
                disabled={update.isPending}
              >
                {update.isPending ? "Saving…" : "Save"}
              </button>
              <button className="btn" onClick={() => setPwOpen(true)}>
                Set password
              </button>
              <div style={{ flex: 1 }} />
              <button
                className="btn danger"
                onClick={confirmDelete}
                disabled={isSelf || del.isPending}
              >
                {del.isPending ? "Deleting…" : "Delete user"}
              </button>
            </div>
          </div>
        </div>
      </div>
      <SetPasswordModal
        open={pwOpen}
        onOpenChange={setPwOpen}
        userId={user.id}
        username={user.username}
      />
    </>
  );
}
