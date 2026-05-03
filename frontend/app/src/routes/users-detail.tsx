import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { PageHead } from "@/components/shared/PageHead";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/shared/Toast";
import { GroupsPicker } from "@/components/users/GroupsPicker";
import { PermissionsPicker } from "@/components/users/PermissionsPicker";
import { SetPasswordModal } from "@/components/users/SetPasswordModal";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUserDetail } from "@/hooks/useUsers";
import { deleteUser, updateUser, type UserDetail } from "@/lib/api/users";
import { queryKeys } from "@/lib/query-keys";

const TABS = ["Basic", "Groups", "Permissions", "API Token", "Profile"] as const;
type TabKey = (typeof TABS)[number];

export default function UsersDetailRoute() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const navigate = useNavigate();
  const me = useCurrentUser();
  const userQ = useUserDetail(id);
  const [tab, setTab] = useState<TabKey>("Basic");

  if (me.isLoading || userQ.isLoading) {
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
  if (userQ.error || !userQ.data) {
    return (
      <Centered>
        <div className="dim">User not found.</div>
      </Centered>
    );
  }

  const user = userQ.data;

  return (
    <>
      <PageHead crumbs={["CAPE", "Admin", "Users", user.username]} />
      <div className="scroll" style={{ padding: 14 }}>
        <div className="panel">
          <div
            style={{
              padding: "0 14px",
              borderBottom: "1px solid var(--color-border)",
              display: "flex",
              gap: 4,
            }}
          >
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: "transparent",
                  border: 0,
                  borderBottom:
                    tab === t
                      ? "2px solid var(--color-accent-strong)"
                      : "2px solid transparent",
                  padding: "10px 12px",
                  fontSize: 12,
                  color: tab === t ? "var(--color-fg-0)" : "var(--color-fg-2)",
                  cursor: "pointer",
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <div style={{ padding: 14 }}>
            {tab === "Basic" && <BasicTab user={user} />}
            {tab === "Groups" && <GroupsPicker user={user} />}
            {tab === "Permissions" && <PermissionsPicker user={user} />}
            {tab === "API Token" && <Placeholder name="API Token" />}
            {tab === "Profile" && <ProfileTab user={user} />}
          </div>
        </div>
      </div>
    </>
  );
}

function Placeholder({ name }: { name: string }) {
  return <div className="dim mono">[{name} tab — implemented in subsequent task]</div>;
}

function BasicTab({ user }: { user: UserDetail }) {
  const me = useCurrentUser();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [pwOpen, setPwOpen] = useState(false);

  const [email, setEmail] = useState(user.email);
  const [firstName, setFirstName] = useState(user.first_name);
  const [lastName, setLastName] = useState(user.last_name);
  const [isStaff, setIsStaff] = useState(user.is_staff);
  const [isActive, setIsActive] = useState(user.is_active);
  const [isSuper, setIsSuper] = useState(user.is_superuser);

  const meIsSuper = me.data?.is_superuser ?? false;
  const isSelf = me.data?.username === user.username;

  const update = useMutation({
    mutationFn: () =>
      updateUser(user.id, {
        email,
        first_name: firstName,
        last_name: lastName,
        is_staff: isStaff,
        is_active: isActive,
        ...(meIsSuper ? { is_superuser: isSuper } : {}),
      }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.users.detail(user.id), data);
      showToast("User updated.", "success");
    },
    onError: () => showToast("Update failed.", "error"),
  });

  const del = useMutation({
    mutationFn: () => deleteUser(user.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.users.all });
      showToast(`Deleted ${user.username}.`, "success");
      navigate("/users");
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error_value?: string } } })?.response?.data
        ?.error_value;
      showToast(msg ?? "Delete failed.", "error");
    },
  });

  function confirmDelete() {
    if (!window.confirm(`Delete user ${user.username}? This cannot be undone.`)) return;
    del.mutate();
  }

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 480 }}>
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
        <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} />
      </Field>
      <Toggle label="Staff" checked={isStaff} onChange={setIsStaff} />
      <Toggle label="Active" checked={isActive} onChange={setIsActive} disabled={isSelf} />
      {meIsSuper && <Toggle label="Superuser" checked={isSuper} onChange={setIsSuper} />}

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

      <SetPasswordModal
        open={pwOpen}
        onOpenChange={setPwOpen}
        userId={user.id}
        username={user.username}
      />
    </div>
  );
}

function ProfileTab({ user }: { user: UserDetail }) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [sub, setSub] = useState(user.userprofile?.subscription ?? "");
  const [reports, setReports] = useState(user.userprofile?.reports ?? false);

  const m = useMutation({
    mutationFn: () => updateUser(user.id, { userprofile: { subscription: sub, reports } }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.users.detail(user.id), data);
      showToast("Profile saved.", "success");
    },
    onError: () => showToast("Save failed.", "error"),
  });

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 480, fontSize: 12 }}>
      <Field label="Subscription">
        <input value={sub} onChange={(e) => setSub(e.target.value)} style={inputStyle} />
      </Field>
      <Toggle label="Reports allowed" checked={reports} onChange={setReports} />
      <div className="dim" style={{ fontSize: 11 }}>
        Last login: {user.last_login ?? "never"} · Joined: {user.date_joined}
      </div>
      <button
        className="btn primary"
        onClick={() => m.mutate()}
        disabled={m.isPending}
        style={{ alignSelf: "flex-start" }}
      >
        {m.isPending ? "Saving…" : "Save profile"}
      </button>
    </div>
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
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        fontSize: 12,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
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
const inputStyleRO: React.CSSProperties = { ...inputStyle, opacity: 0.6, cursor: "not-allowed" };
