/**
 * CSRF token retrieval. Two paths:
 *   1) Read existing `csrftoken` cookie set by Django.
 *   2) Fall back to GET /api/v3/auth/csrf/ which forces Django to set the
 *      cookie if missing (PRD §4.4 step 7).
 */

export function readCsrfCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

let bootstrapPromise: Promise<string | null> | null = null;

export async function ensureCsrfToken(): Promise<string | null> {
  const cached = readCsrfCookie();
  if (cached) return cached;

  if (!bootstrapPromise) {
    bootstrapPromise = fetch("/api/v3/auth/csrf/", { credentials: "include" })
      .then(() => readCsrfCookie())
      .finally(() => {
        bootstrapPromise = null;
      });
  }
  return bootstrapPromise;
}
