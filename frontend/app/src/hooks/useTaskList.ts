import { useInfiniteQuery, type UseInfiniteQueryResult } from "@tanstack/react-query";

import { fetchTaskList, type TaskListPage } from "@/lib/api/tasks";
import {
  fetchUpstreamAnalysisScrape,
  type AnalysisCategory,
} from "@/lib/api/upstream-analysis-scrape";
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

/**
 * Fetch tasks from the v3 endpoint; on 404 / error fall back to scraping
 * upstream's `/analysis/` HTML so the SPA still renders a Recent listing
 * even when running against a vanilla CAPEv2 deploy.
 *
 * The fallback is single-page only — upstream's pagination is server-side
 * with `/analysis/page/<n>/` URLs which we don't replicate yet.
 */
export function useTaskList(filters: TaskListFilters = {}): UseTaskListResult {
  const query = useInfiniteQuery<TaskListPage, Error>({
    queryKey: queryKeys.tasks.list(filters),
    queryFn: async ({ pageParam }) => {
      try {
        return await fetchTaskList({
          ...filters,
          cursor: (pageParam as string | undefined) ?? undefined,
        });
      } catch (err) {
        // v3 missing — fall back to scraping `/analysis/` HTML. Only first
        // page is populated; cursor pagination doesn't apply to the scrape.
        if (pageParam as string | undefined) {
          return { data: [], next_cursor: null };
        }
        const scraped = await fetchUpstreamAnalysisScrape();
        const cat = (filters.category as AnalysisCategory | undefined) ?? "file";
        return {
          data: scraped.rows[cat] ?? [],
          next_cursor: null,
        };
      }
    },
    initialPageParam: undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 15_000,
    retry: 0,
  });

  const tasks = query.data?.pages.flatMap((p) => p.data) ?? [];
  return Object.assign(query, { tasks }) as unknown as UseTaskListResult;
}
