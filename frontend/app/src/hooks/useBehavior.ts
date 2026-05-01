import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import {
  fetchReportBehavior,
  fetchReportBehaviorCalls,
  type BehaviorCallsPage,
  type BehaviorSummary,
} from "@/lib/api/reports";
import {
  asBehaviorReport,
  fetchUpstreamReport,
} from "@/lib/api/upstream-report-scrape";
import { queryKeys } from "@/lib/query-keys";

export function useReportBehavior(taskId: number): UseQueryResult<BehaviorSummary, Error> {
  return useQuery({
    queryKey: queryKeys.reports.behavior(taskId),
    queryFn: async () => {
      try {
        return await fetchReportBehavior(taskId);
      } catch {
        // Upstream lazy-loads behavior via /analysis/load_files/<id>/behavior/
        // which requires CSRF; our anonymous scrape can't reach it. Return
        // an empty BehaviorSummary so the tab renders an empty state rather
        // than crashing the whole page.
        return asBehaviorReport(await fetchUpstreamReport(taskId));
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useReportBehaviorCalls(
  taskId: number,
  pid: number | null,
  page: number,
): UseQueryResult<BehaviorCallsPage, Error> {
  return useQuery({
    queryKey: queryKeys.reports.behaviorCalls(taskId, `${pid ?? ""}:${page}`),
    queryFn: async () => {
      try {
        return await fetchReportBehaviorCalls(taskId, pid as number, page);
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
