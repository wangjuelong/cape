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
import {
  asAttackReport,
  asConfigReport,
  asDroppedReport,
  asNetworkReport,
  asPayloadsReport,
  asScreenshotsReport,
  asStaticReport,
  fetchUpstreamReport,
} from "@/lib/api/upstream-report-scrape";
import { queryKeys } from "@/lib/query-keys";

const PASSTHROUGH_OPTS = { staleTime: 60_000, retry: false } as const;

export function useReportStatic(taskId: number): UseQueryResult<StaticReport, Error> {
  return useQuery({
    queryKey: queryKeys.reports.static(taskId),
    queryFn: async () => {
      try {
        return await fetchReportStatic(taskId);
      } catch {
        return asStaticReport(await fetchUpstreamReport(taskId));
      }
    },
    ...PASSTHROUGH_OPTS,
  });
}

export function useReportAttack(taskId: number): UseQueryResult<AttackReport, Error> {
  return useQuery({
    queryKey: queryKeys.reports.attack(taskId),
    queryFn: async () => {
      try {
        return await fetchReportAttack(taskId);
      } catch {
        return asAttackReport(await fetchUpstreamReport(taskId));
      }
    },
    ...PASSTHROUGH_OPTS,
  });
}

export function useReportConfig(taskId: number): UseQueryResult<ConfigReport, Error> {
  return useQuery({
    queryKey: queryKeys.reports.config(taskId),
    queryFn: async () => {
      try {
        return await fetchReportConfig(taskId);
      } catch {
        return asConfigReport(await fetchUpstreamReport(taskId));
      }
    },
    ...PASSTHROUGH_OPTS,
  });
}

export function useReportNetwork(taskId: number): UseQueryResult<NetworkReport, Error> {
  return useQuery({
    queryKey: queryKeys.reports.network(taskId),
    queryFn: async () => {
      try {
        return await fetchReportNetwork(taskId);
      } catch {
        return asNetworkReport(await fetchUpstreamReport(taskId));
      }
    },
    ...PASSTHROUGH_OPTS,
  });
}

export function useReportDropped(taskId: number): UseQueryResult<DroppedReport, Error> {
  return useQuery({
    queryKey: queryKeys.reports.dropped(taskId),
    queryFn: async () => {
      try {
        return await fetchReportDropped(taskId);
      } catch {
        return asDroppedReport(await fetchUpstreamReport(taskId));
      }
    },
    ...PASSTHROUGH_OPTS,
  });
}

export function useReportPayloads(taskId: number): UseQueryResult<PayloadsReport, Error> {
  return useQuery({
    queryKey: queryKeys.reports.payloads(taskId),
    queryFn: async () => {
      try {
        return await fetchReportPayloads(taskId);
      } catch {
        return asPayloadsReport(await fetchUpstreamReport(taskId));
      }
    },
    ...PASSTHROUGH_OPTS,
  });
}

export function useReportScreenshots(taskId: number): UseQueryResult<ScreenshotsReport, Error> {
  return useQuery({
    queryKey: queryKeys.reports.screenshots(taskId),
    queryFn: async () => {
      try {
        return await fetchReportScreenshots(taskId);
      } catch {
        return asScreenshotsReport(await fetchUpstreamReport(taskId));
      }
    },
    ...PASSTHROUGH_OPTS,
  });
}
