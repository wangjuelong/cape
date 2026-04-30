import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { fetchFeatureFlags } from "@/lib/api/system";
import { fetchUpstreamSubmitScrape } from "@/lib/api/upstream-scrape";
import { queryKeys } from "@/lib/query-keys";

/**
 * Returns the live api.conf snapshot for endpoint gating.
 *
 * Strategy:
 *   1. Try /api/v3/system/feature-flags/ (this fork).
 *   2. On 404 / error, fall back to scraping upstream /submit/ HTML to
 *      detect which task-creation routes are enabled. Lets the SPA still
 *      gate its tabs correctly when running against a vanilla CAPE.
 */
export function useFeatureFlags(): UseQueryResult<Record<string, boolean>, Error> {
  return useQuery({
    queryKey: queryKeys.system.flags,
    queryFn: async () => {
      try {
        return await fetchFeatureFlags();
      } catch {
        const scraped = await fetchUpstreamSubmitScrape();
        // Map upstream /submit/ tab visibility → api.conf flag names.
        return {
          filecreate: scraped.tabs.file,
          urlcreate: scraped.tabs.url,
          dlnexeccreate: scraped.tabs.dlnexec,
          downloading_services: scraped.tabs.downloading_service,
          staticextraction: scraped.tabs.static,
        };
      }
    },
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
