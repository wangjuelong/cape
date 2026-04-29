import { useInfiniteQuery, type UseInfiniteQueryResult } from "@tanstack/react-query";

import { fetchTaskList, type TaskListPage } from "@/lib/api/tasks";
import { queryKeys } from "@/lib/query-keys";
import type { TaskListFilters, TaskSummary } from "@/types/api";

type InfiniteResult = UseInfiniteQueryResult<
  { pages: TaskListPage[]; pageParams: unknown[] },
  Error
>;

export type UseTaskListResult = InfiniteResult & {
  /** Flattened convenience: every task across loaded pages, in order. */
  tasks: TaskSummary[];
};

export function useTaskList(filters: TaskListFilters = {}): UseTaskListResult {
  const query = useInfiniteQuery<TaskListPage, Error>({
    queryKey: queryKeys.tasks.list(filters),
    queryFn: ({ pageParam }) =>
      fetchTaskList({ ...filters, cursor: (pageParam as string | undefined) ?? undefined }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 15_000,
  });

  const tasks = query.data?.pages.flatMap((p) => p.data) ?? [];
  return Object.assign(query, { tasks }) as unknown as UseTaskListResult;
}
