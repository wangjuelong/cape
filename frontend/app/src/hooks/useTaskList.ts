import { useInfiniteQuery } from "@tanstack/react-query";

import { fetchTaskList } from "@/lib/api/tasks";
import { queryKeys } from "@/lib/query-keys";
import type { TaskListFilters, TaskSummary } from "@/types/api";

/**
 * Fetch tasks from /api/v3/tasks/. The previous "scrape upstream
 * /analysis/ or /analysis/pending/ HTML on apiv3 failure" fallback has
 * been removed — apiv3 is now authoritative.
 */
export function useTaskList(filters: TaskListFilters = {}) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.tasks.list(filters),
    queryFn: ({ pageParam }) =>
      fetchTaskList({ ...filters, cursor: pageParam ?? undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 15_000,
    retry: 0,
  });

  const tasks: TaskSummary[] = query.data?.pages.flatMap((p) => p.data) ?? [];
  return Object.assign(query, { tasks });
}
