import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { fetchCurrentUser } from "@/lib/api/auth";
import { queryKeys } from "@/lib/query-keys";
import type { CurrentUser } from "@/types/api";

export function useCurrentUser(): UseQueryResult<CurrentUser, Error> {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
