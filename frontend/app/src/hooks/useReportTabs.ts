import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import {
  fetchReportAttack,
  fetchReportConfig,
  fetchReportDropped,
  fetchReportNetwork,
  fetchReportPayloads,
  fetchReportScreenshots,
  fetchReportStatic,
  type AttackReport,
  type ConfigReport,
  type DroppedReport,
  type NetworkReport,
  type PayloadsReport,
  type ScreenshotsReport,
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

export function useReportNetwork(taskId: number): UseQueryResult<NetworkReport, Error> {
  return useQuery({
    queryKey: queryKeys.reports.network(taskId),
    queryFn: () => fetchReportNetwork(taskId),
    ...PASSTHROUGH_OPTS,
  });
}

export function useReportDropped(taskId: number): UseQueryResult<DroppedReport, Error> {
  return useQuery({
    queryKey: queryKeys.reports.dropped(taskId),
    queryFn: () => fetchReportDropped(taskId),
    ...PASSTHROUGH_OPTS,
  });
}

export function useReportPayloads(taskId: number): UseQueryResult<PayloadsReport, Error> {
  return useQuery({
    queryKey: queryKeys.reports.payloads(taskId),
    queryFn: () => fetchReportPayloads(taskId),
    ...PASSTHROUGH_OPTS,
  });
}

export function useReportScreenshots(taskId: number): UseQueryResult<ScreenshotsReport, Error> {
  return useQuery({
    queryKey: queryKeys.reports.screenshots(taskId),
    queryFn: () => fetchReportScreenshots(taskId),
    ...PASSTHROUGH_OPTS,
  });
}
