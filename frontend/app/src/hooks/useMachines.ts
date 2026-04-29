import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { fetchMachines, type Machine } from "@/lib/api/machines";
import { queryKeys } from "@/lib/query-keys";

export function useMachines(): UseQueryResult<Machine[], Error> {
  return useQuery({
    queryKey: queryKeys.machines.all,
    queryFn: fetchMachines,
    staleTime: 60_000,
  });
}
