import { useNavigate } from "react-router-dom";

import { Icon } from "./icons";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export function Topbar() {
  const navigate = useNavigate();
  const meQuery = useCurrentUser();
  const username = meQuery.data?.username ?? "guest";
  const initials = (meQuery.data?.username ?? "??")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="flex h-12 items-center gap-3 border-b px-3"
      style={{ borderColor: "var(--color-border)", background: "var(--color-bg-1)" }}
    >
      <button
        type="button"
        className="flex items-center gap-2 px-2 py-1 text-sm font-semibold"
        onClick={() => navigate("/")}
        style={{ color: "var(--color-fg-0)" }}
      >
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ background: "var(--color-accent)" }}
        />
        CAPE
        <span className="text-[10px] font-normal" style={{ color: "var(--color-fg-2)" }}>
          v2.5
        </span>
      </button>

      <div
        className="flex h-7 flex-1 items-center gap-2 rounded px-2"
        style={{
          background: "var(--color-bg-2)",
          border: "1px solid var(--color-border)",
        }}
      >
        <Icon.search size={14} style={{ color: "var(--color-fg-2)" }} />
        <input
          type="search"
          placeholder="Search hash, IP, family, task ID, signature…"
          className="flex-1 bg-transparent text-xs outline-none"
          style={{ color: "var(--color-fg-0)" }}
        />
        <span className="text-[10px]" style={{ color: "var(--color-fg-2)" }}>
          ⌘K
        </span>
      </div>

      <button
        type="button"
        onClick={() => navigate("/submit")}
        className="flex h-7 items-center gap-1 rounded px-3 text-xs"
        style={{
          background: "var(--color-bg-2)",
          border: "1px solid var(--color-border)",
          color: "var(--color-fg-0)",
        }}
      >
        <Icon.upload size={14} />
        Submit
      </button>
      <button type="button" className="grid h-7 w-7 place-items-center rounded">
        <Icon.bell size={14} style={{ color: "var(--color-fg-1)" }} />
      </button>
      <button type="button" className="grid h-7 w-7 place-items-center rounded">
        <Icon.cog size={14} style={{ color: "var(--color-fg-1)" }} />
      </button>
      <div
        className="flex h-7 items-center gap-2 rounded px-2 text-xs"
        style={{ background: "var(--color-bg-2)" }}
      >
        <span
          className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-semibold"
          style={{
            background: "var(--color-accent-soft)",
            color: "var(--color-accent-strong)",
          }}
        >
          {initials}
        </span>
        <span style={{ color: "var(--color-fg-1)" }}>{username}</span>
      </div>
    </div>
  );
}
