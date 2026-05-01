import axios, { type AxiosInstance, type InternalAxiosRequestConfig, AxiosHeaders } from "axios";

import { ensureCsrfToken } from "./csrf";

const UNSAFE_METHODS = new Set(["post", "put", "patch", "delete"]);

export const apiClient: AxiosInstance = axios.create({
  baseURL: "/api/v3",
  withCredentials: true,
  headers: {
    Accept: "application/json",
  },
});

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const method = (config.method ?? "get").toLowerCase();
  if (UNSAFE_METHODS.has(method)) {
    const token = await ensureCsrfToken();
    if (token) {
      const headers = AxiosHeaders.from(config.headers);
      headers.set("X-CSRFToken", token);
      config.headers = headers;
    }
  }
  return config;
});

// Bounce the user to Django allauth on auth failures. DRF SessionAuth
// returns 401 when no creds were even attempted, and 403 for "anonymous
// against IsAuthenticated permission" — both mean "log in first".
//
// We deliberately don't redirect for arbitrary 403s on logged-in users
// (that's a real authorization denial, not a need-to-login). Detection:
// when the user's allauth session cookie is absent we treat 403 as
// "needs login". If the session cookie is present, 403 propagates as a
// normal error so the caller can render "permission denied".
function hasSessionCookie(): boolean {
  // Django session cookie is `sessionid` by default; allauth doesn't
  // override. Cookies for HttpOnly flags are still readable here only if
  // not HttpOnly — which means a heuristic. Fall back to "csrftoken
  // present but sessionid absent" → unauthenticated.
  const cookies = document.cookie.split(/;\s*/);
  return cookies.some((c) => c.startsWith("sessionid="));
}

function redirectToLogin(): void {
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.assign(`/login-bridge?next=${next}`);
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      redirectToLogin();
    } else if (status === 403 && !hasSessionCookie()) {
      // DRF returns 403 (not 401) for SessionAuth when there are no creds
      // because the framework treats anonymous as "permission denied" against
      // IsAuthenticated. Detect this and bounce to login.
      redirectToLogin();
    }
    return Promise.reject(error);
  },
);
