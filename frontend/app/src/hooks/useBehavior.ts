import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import {
  fetchReportBehavior,
  fetchReportBehaviorCalls,
  fetchReportBehaviorSearch,
  type BehaviorCallFilters,
  type BehaviorCallsPage,
  type BehaviorSearchResponse,
  type BehaviorSummary,
} from "@/lib/api/reports";
import { queryKeys } from "@/lib/query-keys";

/**
 * Fetch the behavior-summary tab of a task report via apiv3.
 *
 * The previous "scrape upstream HTML on apiv3 failure" fallback has been
 * removed — apiv3 is now authoritative.
 */
export function useReportBehavior(taskId: number): UseQueryResult<BehaviorSummary, Error> {
  return useQuery({
    queryKey: queryKeys.reports.behavior(taskId),
    queryFn: () => fetchReportBehavior(taskId),
    staleTime: 60_000,
    retry: false,
  });
}

export function useReportBehaviorCalls(
  taskId: number,
  pid: number | null,
  page: number,
  filters: BehaviorCallFilters = {},
): UseQueryResult<BehaviorCallsPage, Error> {
  const filterKey = JSON.stringify(filters);
  return useQuery({
    queryKey: queryKeys.reports.behaviorCalls(taskId, `${pid ?? ""}:${page}:${filterKey}`),
    queryFn: async () => {
      try {
        return await fetchReportBehaviorCalls(taskId, pid as number, page, filters);
      } catch {
        return {
          calls: [],
          page,
          total_chunks: 0,
          has_next: false,
        } satisfies BehaviorCallsPage;
      }
    },
    enabled: pid !== null,
    staleTime: 30_000,
    retry: false,
  });
}

export function useReportBehaviorSearch(
  taskId: number,
  query: string,
): UseQueryResult<BehaviorSearchResponse, Error> {
  return useQuery({
    queryKey: ["reports", "behavior", "search", taskId, query],
    queryFn: () => fetchReportBehaviorSearch(taskId, query),
    enabled: query.trim().length >= 2,
    staleTime: 30_000,
    retry: false,
  });
}
