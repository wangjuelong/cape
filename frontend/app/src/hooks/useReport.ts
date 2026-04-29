import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { fetchReportSummary, type ReportSummary } from "@/lib/api/reports";
import { queryKeys } from "@/lib/query-keys";

export function useReportSummary(taskId: number): UseQueryResult<ReportSummary, Error> {
  return useQuery({
    queryKey: queryKeys.reports.summary(taskId),
    queryFn: () => fetchReportSummary(taskId),
    staleTime: 30_000,
  });
}
