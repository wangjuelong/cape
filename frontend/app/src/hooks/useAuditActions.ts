import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { fetchAuditActions, type AuditActionListResponse } from "@/lib/api/audits";
import { queryKeys } from "@/lib/query-keys";

/**
 * The action-value catalog. Used to populate the Action filter dropdown
 * and to label/colour rows. Cached forever per session — the catalog
 * only changes on a backend release.
 */
export function useAuditActions(): UseQueryResult<AuditActionListResponse, Error> {
  return useQuery({
    queryKey: queryKeys.audits.actions,
    queryFn: fetchAuditActions,
    staleTime: Infinity,
    retry: false,
  });
}
