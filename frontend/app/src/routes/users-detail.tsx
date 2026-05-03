import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { PageHead } from "@/components/shared/PageHead";
import { Spinner } from "@/components/ui/spinner";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUserDetail } from "@/hooks/useUsers";
import type { UserDetail } from "@/lib/api/users";

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
            {tab === "Groups" && <Placeholder name="Groups" />}
            {tab === "Permissions" && <Placeholder name="Permissions" />}
            {tab === "API Token" && <Placeholder name="API Token" />}
            {tab === "Profile" && <Placeholder name="Profile" />}
          </div>
        </div>
      </div>
    </>
  );
}

function Placeholder({ name }: { name: string }) {
  return <div className="dim mono">[{name} tab — implemented in subsequent task]</div>;
}

// BasicTab is implemented inline here in the next task; for now stub:
function BasicTab({ user }: { user: UserDetail }) {
  return (
    <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
      <div>
        <strong>Username:</strong> {user.username}
      </div>
      <div>
        <strong>Email:</strong> {user.email || "—"}
      </div>
      <div>
        <strong>is_staff:</strong> {String(user.is_staff)}
      </div>
      <div>
        <strong>is_superuser:</strong> {String(user.is_superuser)}
      </div>
      <div>
        <strong>is_active:</strong> {String(user.is_active)}
      </div>
    </div>
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
