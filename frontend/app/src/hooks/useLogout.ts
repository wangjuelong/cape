import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";

import { logout } from "@/lib/api/auth";
import { suppressAuthRedirect } from "@/lib/api/client";

/**
 * Single-click logout. Posts to /accounts/logout/ (allauth) bypassing
 * the confirmation page, clears the local user/feature-flag caches,
 * then redirects the browser to /accounts/login/.
 *
 * Caller usage:
 *   const { mutate: signOut, isPending } = useLogout();
 *   <button onClick={() => signOut()}>Sign out</button>
 */
export function useLogout(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      // Lock the axios 401/403 interceptor BEFORE any in-flight request can
      // see the freshly-cleared session cookie and try to redirect to
      // /login-bridge?next=… ahead of our own navigation below. Without
      // this, the user briefly lands on /login-bridge with stale `next`
      // (e.g. /dashboard, which they're being kicked out of) and Django
      // 404s because /login-bridge is a SPA-only route.
      suppressAuthRedirect();
      // Cancel any in-flight queries so their .catch can't fire after
      // we've already navigated.
      await queryClient.cancelQueries();
      await logout();
    },
    onSettled: () => {
      // Drop any user-scoped cache so the next render can't flash stale data.
      queryClient.clear();
      // Hard navigation — drops the entire SPA state machine and lets
      // Django render the (newly themed) login page.
      window.location.replace("/accounts/login/");
    },
  });
}
