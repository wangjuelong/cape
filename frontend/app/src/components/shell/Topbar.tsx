import { useNavigate } from "react-router-dom";
import { LogOut, KeyRound } from "lucide-react";

import { Icon } from "./icons";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLogout } from "@/hooks/useLogout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Topbar() {
  const navigate = useNavigate();
  const meQuery = useCurrentUser();
  const username = meQuery.data?.username ?? "guest";
  const email = meQuery.data?.email;
  const isStaff = meQuery.data?.is_staff ?? false;
  const initials = (meQuery.data?.username ?? "??").slice(0, 2).toUpperCase();
  const { mutate: signOut, isPending: isSigningOut } = useLogout();

  return (
    <div className="topbar">
      <button type="button" className="brand" onClick={() => navigate("/")}>
        <span className="brand-mark" aria-hidden />
        CAPE
      </button>

      <div className="topbar-search">
        <span className="icon">
          <Icon.search size={14} />
        </span>
        <input
          type="search"
          placeholder="Search hash, IP, family, task ID, signature…"
          aria-label="Global search"
        />
        <span className="hint">⌘K</span>
      </div>

      <div className="topbar-actions">
        <button
          type="button"
          className="btn ghost"
          onClick={() => navigate("/submit")}
          style={{ height: 28 }}
        >
          <Icon.upload size={14} />
          <span>Submit</span>
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Notifications"
          style={{ position: "relative" }}
        >
          <Icon.bell size={14} />
          <span
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: 6,
              height: 6,
              borderRadius: 3,
              background: "var(--color-sev-crit)",
            }}
          />
        </button>
        <button type="button" className="icon-btn" title="Settings">
          <Icon.cog size={14} />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="user-chip"
              disabled={isSigningOut}
              aria-label={`Account menu for ${username}`}
            >
              <span className="user-avatar">{initials}</span>
              <span>{username}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="min-w-[200px]">
            <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
            <div className="px-2 pb-1 pt-0.5">
              <div
                className="font-mono text-[12px] font-semibold"
                style={{ color: "var(--color-fg-0)" }}
              >
                {username}
              </div>
              {email && (
                <div
                  className="truncate font-mono text-[10px]"
                  style={{ color: "var(--color-fg-2)" }}
                  title={email}
                >
                  {email}
                </div>
              )}
              {isStaff && (
                <span
                  className="mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                  style={{
                    background: "var(--color-accent-soft)",
                    color: "var(--color-accent-strong)",
                  }}
                >
                  staff
                </span>
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/accounts/password/change/">
                <KeyRound size={12} />
                <span>Change password</span>
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              danger
              disabled={isSigningOut}
              onSelect={(e) => {
                e.preventDefault();
                signOut();
              }}
            >
              <LogOut size={12} />
              <span>{isSigningOut ? "Signing out…" : "Sign out"}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
