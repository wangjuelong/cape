import { useQuery } from "@tanstack/react-query";

import { fetchStatistics, type StatisticsResponse } from "@/lib/api/statistics";

/**
 * Fetch statistics for the last N days via apiv3 `/api/v3/statistics/<days>/`.
 *
 * The previous "scrape upstream HTML on apiv3 failure" fallback has been
 * removed — apiv3 is now authoritative.
 */
export function useStatistics(days: number) {
  return useQuery<StatisticsResponse>({
    queryKey: ["statistics", days],
    queryFn: () => fetchStatistics(days),
    staleTime: 60_000,
    retry: 0,
  });
}
