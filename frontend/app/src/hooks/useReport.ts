import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { fetchReportSummary, type ReportSummary } from "@/lib/api/reports";
import {
  asReportSummary,
  fetchUpstreamReport,
} from "@/lib/api/upstream-report-scrape";
import { queryKeys } from "@/lib/query-keys";

/**
 * Try v3 `/api/v3/reports/<id>/summary/` first; fall back to scraping
 * upstream `/_upstream/analysis/<id>/` HTML when v3 is unreachable so the
 * SPA still renders the verdict banner + tab strip + summary tab when
 * pointed at a vanilla CAPEv2 deploy.
 */
export function useReportSummary(taskId: number): UseQueryResult<ReportSummary, Error> {
  return useQuery({
    queryKey: queryKeys.reports.summary(taskId),
    queryFn: async () => {
      try {
        return await fetchReportSummary(taskId);
      } catch {
        const scraped = await fetchUpstreamReport(taskId);
        return asReportSummary(scraped);
      }
    },
    staleTime: 30_000,
    retry: 0,
  });
}
