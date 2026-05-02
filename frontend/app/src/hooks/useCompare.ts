import { useQuery } from "@tanstack/react-query";

import {
  fetchCompareCandidates,
  fetchCompareDiff,
  type CompareCandidatesResponse,
  type CompareDiffResponse,
} from "@/lib/api/compare";

/**
 * Fetch comparison candidates for a left-side task via apiv3.
 *
 * The previous "scrape upstream HTML on apiv3 failure" fallback has been
 * removed — apiv3 is now authoritative.
 */
export function useCompareCandidates(leftId: number | null) {
  return useQuery<CompareCandidatesResponse>({
    queryKey: ["compare", "candidates", leftId],
    enabled: leftId !== null && Number.isFinite(leftId),
    queryFn: () => fetchCompareCandidates(leftId as number),
    staleTime: 60_000,
    retry: 0,
  });
}

/**
 * Fetch a left-vs-right comparison diff via apiv3.
 *
 * The previous "scrape upstream HTML on apiv3 failure" fallback has been
 * removed — apiv3 is now authoritative.
 */
export function useCompareDiff(leftId: number | null, rightId: number | null) {
  return useQuery<CompareDiffResponse>({
    queryKey: ["compare", "diff", leftId, rightId],
    enabled:
      leftId !== null && rightId !== null && Number.isFinite(leftId) && Number.isFinite(rightId),
    queryFn: () => fetchCompareDiff(leftId as number, rightId as number),
    staleTime: 60_000,
    retry: 0,
  });
}
