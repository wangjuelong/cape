import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { fetchReportSummary, type ReportSummary } from "@/lib/api/reports";
import { queryKeys } from "@/lib/query-keys";

/**
 * Fetch a task's report summary via /api/v3/reports/<id>/summary/.
 *
 * The previous "scrape upstream HTML on apiv3 failure" fallback has been
 * removed — apiv3 is now authoritative.
 */
export function useReportSummary(taskId: number): UseQueryResult<ReportSummary, Error> {
  return useQuery({
    queryKey: queryKeys.reports.summary(taskId),
    queryFn: () => fetchReportSummary(taskId),
    staleTime: 30_000,
    retry: 0,
  });
}
