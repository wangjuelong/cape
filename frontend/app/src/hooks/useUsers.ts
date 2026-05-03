import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { getUser, listUsers, type UserListFilters } from "@/lib/api/users";
import { queryKeys } from "@/lib/query-keys";

export function useUsersInfinite(filters: UserListFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.users.list(filters),
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      listUsers({ ...filters, cursor: pageParam, limit: filters.limit ?? 20 }),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 15_000,
  });
}

export function useUserDetail(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.users.detail(id ?? 0),
    queryFn: () => getUser(id!),
    enabled: id !== undefined && id > 0,
    staleTime: 15_000,
  });
}
