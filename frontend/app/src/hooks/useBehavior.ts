import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import {
  fetchReportBehavior,
  fetchReportBehaviorCalls,
  type BehaviorCallsPage,
  type BehaviorSummary,
} from "@/lib/api/reports";
import { queryKeys } from "@/lib/query-keys";

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
): UseQueryResult<BehaviorCallsPage, Error> {
  return useQuery({
    queryKey: queryKeys.reports.behaviorCalls(taskId, `${pid ?? ""}:${page}`),
    queryFn: () => fetchReportBehaviorCalls(taskId, pid as number, page),
    enabled: pid !== null,
    staleTime: 30_000,
  });
}
