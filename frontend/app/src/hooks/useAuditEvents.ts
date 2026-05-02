import { useInfiniteQuery } from "@tanstack/react-query";

import { fetchAuditEvents, type AuditFilters } from "@/lib/api/audits";
import { queryKeys } from "@/lib/query-keys";

/**
 * Cursor-paginated audit events query. The backend returns `next_cursor`
 * (string) or null. We feed it back as `cursor=` in the next request.
 */
export function useAuditEvents(filters: AuditFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.audits.list(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchAuditEvents({ ...filters, cursor: pageParam }),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}
