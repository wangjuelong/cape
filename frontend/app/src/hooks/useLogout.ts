import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";

import { logout } from "@/lib/api/auth";

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
    mutationFn: logout,
    onSettled: () => {
      // Drop any user-scoped cache so the next render can't flash stale data.
      queryClient.clear();
      // Hard navigation — drops the entire SPA state machine and lets
      // Django render the (newly themed) login page.
      window.location.assign("/accounts/login/");
    },
  });
}
