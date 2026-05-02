import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { fetchFeatureFlags } from "@/lib/api/system";
import { queryKeys } from "@/lib/query-keys";

/**
 * Returns the live api.conf snapshot for endpoint gating via
 * /api/v3/system/feature-flags/. The previous "scrape upstream /submit/
 * HTML on apiv3 failure" fallback has been removed — apiv3 is now
 * authoritative.
 */
export function useFeatureFlags(): UseQueryResult<Record<string, boolean>, Error> {
  return useQuery({
    queryKey: queryKeys.system.flags,
    queryFn: () => fetchFeatureFlags(),
    staleTime: 5 * 60_000,
    retry: 0,
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
