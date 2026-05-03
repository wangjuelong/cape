import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import {
  getGroup,
  getGroupMembers,
  listGroups,
  type GroupListFilters,
} from "@/lib/api/groups";
import { queryKeys } from "@/lib/query-keys";

export function useGroupsInfinite(filters: GroupListFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.groups.list(filters),
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      listGroups({ ...filters, cursor: pageParam, limit: filters.limit ?? 20 }),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 15_000,
  });
}

export function useGroupDetail(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.groups.detail(id ?? 0),
    queryFn: () => getGroup(id!),
    enabled: id !== undefined && id > 0,
    staleTime: 15_000,
  });
}

export function useGroupMembers(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.groups.members(id ?? 0),
    queryFn: () => getGroupMembers(id!, { limit: 200 }),
    enabled: id !== undefined && id > 0,
    staleTime: 15_000,
  });
}
