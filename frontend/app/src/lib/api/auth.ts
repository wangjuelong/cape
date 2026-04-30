import { apiClient } from "./client";
import { ensureCsrfToken } from "./csrf";
import type { CurrentUser } from "@/types/api";

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const { data } = await apiClient.get<CurrentUser>("/me/");
  return data;
}

/**
 * One-shot logout. Posts directly to allauth's /accounts/logout/ with
 * the CSRF header so the user is signed out without seeing the
 * "Sign out — Are you sure?" confirmation page (allauth's default
 * GET-shows-form behaviour).
 *
 * Returns when the cookie has been cleared on the server. Caller is
 * responsible for navigating away (typically to /accounts/login/).
 */
export async function logout(): Promise<void> {
  const csrf = await ensureCsrfToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (csrf) headers["X-CSRFToken"] = csrf;

  const resp = await fetch("/accounts/logout/", {
    method: "POST",
    credentials: "include",
    headers,
    redirect: "manual", // allauth would 302 to LOGIN — we navigate ourselves
  });

  // `redirect: "manual"` yields opaqueredirect or status 0 on success.
  // Anything 5xx is a real failure.
  if (resp.status >= 500) {
    throw new Error(`Logout failed (HTTP ${resp.status})`);
  }
}
