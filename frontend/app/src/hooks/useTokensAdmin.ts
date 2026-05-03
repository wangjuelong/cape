import { useInfiniteQuery } from "@tanstack/react-query";

import { listAdminTokens, type AdminTokensListFilters } from "@/lib/api/tokens";
import { queryKeys } from "@/lib/query-keys";

export function useAdminTokensInfinite(filters: Omit<AdminTokensListFilters, "cursor">) {
  return useInfiniteQuery({
    queryKey: queryKeys.tokens.adminList(filters),
    queryFn: ({ pageParam }) =>
      listAdminTokens({
        ...filters,
        cursor: pageParam ?? undefined,
      }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}
