import { useQuery } from "@tanstack/react-query";

import {
  fetchCompareCandidates,
  fetchCompareDiff,
  type CompareCandidatesResponse,
  type CompareDiffResponse,
} from "@/lib/api/compare";
import {
  fetchUpstreamCompareCandidates,
  fetchUpstreamCompareDiff,
} from "@/lib/api/upstream-compare-scrape";

export function useCompareCandidates(leftId: number | null) {
  return useQuery<CompareCandidatesResponse>({
    queryKey: ["compare", "candidates", leftId],
    enabled: leftId !== null && Number.isFinite(leftId),
    queryFn: async () => {
      const id = leftId as number;
      try {
        return await fetchCompareCandidates(id);
      } catch {
        const scraped = await fetchUpstreamCompareCandidates(id);
        return {
          ok: scraped.ok,
          left: scraped.left,
          records: scraped.records,
          md5: scraped.md5,
        };
      }
    },
    staleTime: 60_000,
    retry: 0,
  });
}

export function useCompareDiff(leftId: number | null, rightId: number | null) {
  return useQuery<CompareDiffResponse>({
    queryKey: ["compare", "diff", leftId, rightId],
    enabled:
      leftId !== null && rightId !== null && Number.isFinite(leftId) && Number.isFinite(rightId),
    queryFn: async () => {
      const left = leftId as number;
      const right = rightId as number;
      try {
        return await fetchCompareDiff(left, right);
      } catch {
        const scraped = await fetchUpstreamCompareDiff(left, right);
        return {
          ok: scraped.ok,
          left: scraped.left,
          right: scraped.right,
          left_counts: scraped.left_counts,
          right_counts: scraped.right_counts,
          summary: scraped.summary,
        };
      }
    },
    staleTime: 60_000,
    retry: 0,
  });
}
