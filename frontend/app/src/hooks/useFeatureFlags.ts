import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { fetchFeatureFlags } from "@/lib/api/system";
import { queryKeys } from "@/lib/query-keys";

/**
 * Returns the live api.conf [<endpoint>].enabled snapshot. The SPA hides
 * nav items / buttons whose underlying endpoint is currently disabled.
 *
 * Empty object on initial load — call sites should treat unknown keys as
 * "enabled" (fail-open) to avoid hiding everything during the bootstrap
 * round-trip.
 */
export function useFeatureFlags(): UseQueryResult<Record<string, boolean>, Error> {
  return useQuery({
    queryKey: queryKeys.system.flags,
    queryFn: fetchFeatureFlags,
    staleTime: 5 * 60_000,
  });
}

export function isFlagEnabled(
  flags: Record<string, boolean> | undefined,
  key: string,
  fallback = true,
): boolean {
  if (!flags) return fallback;
  return flags[key] ?? fallback;
}
