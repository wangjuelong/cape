import { useQuery } from "@tanstack/react-query";

import { fetchStatistics, type StatisticsResponse } from "@/lib/api/statistics";
import { fetchUpstreamStatisticsScrape } from "@/lib/api/upstream-statistics-scrape";

/**
 * Try v3 `/api/v3/statistics/<days>/` first; on failure fall back to
 * scraping upstream `/_upstream/statistics/<days>/` HTML so the SPA
 * still shows the same numbers when running against a vanilla CAPEv2
 * Django without our v3 app.
 */
export function useStatistics(days: number) {
  return useQuery<StatisticsResponse>({
    queryKey: ["statistics", days],
    queryFn: async () => {
      try {
        return await fetchStatistics(days);
      } catch {
        return await fetchUpstreamStatisticsScrape(days);
      }
    },
    staleTime: 60_000,
    retry: 0,
  });
}
