import { useInfiniteQuery, type UseInfiniteQueryResult } from "@tanstack/react-query";

import {
  fetchAuditEvents,
  type AuditFilters,
  type AuditListResponse,
} from "@/lib/api/audits";
import { queryKeys } from "@/lib/query-keys";

/**
 * Cursor-paginated audit events query. The backend returns `next_cursor`
 * (string) or null. We feed it back as `cursor=` in the next request.
 */
export function useAuditEvents(
  filters: AuditFilters,
): UseInfiniteQueryResult<
  { pages: AuditListResponse[]; pageParams: (string | undefined)[] },
  Error
> {
  return useInfiniteQuery<AuditListResponse, Error>({
    queryKey: queryKeys.audits.list(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchAuditEvents({ ...filters, cursor: pageParam as string | undefined }),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}
