import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import {
  fetchReportAttack,
  fetchReportConfig,
  fetchReportStatic,
  type AttackReport,
  type ConfigReport,
  type StaticReport,
} from "@/lib/api/reports";
import { queryKeys } from "@/lib/query-keys";

const PASSTHROUGH_OPTS = { staleTime: 60_000, retry: false } as const;

export function useReportStatic(taskId: number): UseQueryResult<StaticReport, Error> {
  return useQuery({
    queryKey: queryKeys.reports.static(taskId),
    queryFn: () => fetchReportStatic(taskId),
    ...PASSTHROUGH_OPTS,
  });
}

export function useReportAttack(taskId: number): UseQueryResult<AttackReport, Error> {
  return useQuery({
    queryKey: queryKeys.reports.attack(taskId),
    queryFn: () => fetchReportAttack(taskId),
    ...PASSTHROUGH_OPTS,
  });
}

export function useReportConfig(taskId: number): UseQueryResult<ConfigReport, Error> {
  return useQuery({
    queryKey: queryKeys.reports.config(taskId),
    queryFn: () => fetchReportConfig(taskId),
    ...PASSTHROUGH_OPTS,
  });
}
