import { useQuery } from "@tanstack/react-query";

import {
  fetchUpstreamAnalysisScrape,
  type UpstreamAnalysisScrape,
} from "@/lib/api/upstream-analysis-scrape";

/**
 * Returns the upstream `/analysis/` page's visible tabs + per-category
 * tasks. Used by the Recent page to gate the URLs sub-tab the same way
 * upstream's `{% if config.url_analysis %}` template does — the SPA
 * doesn't need to know the underlying flag, just whether upstream is
 * rendering the tab.
 */
export function useAnalysisScrape() {
  return useQuery<UpstreamAnalysisScrape>({
    queryKey: ["upstream", "analysis-scrape"],
    queryFn: fetchUpstreamAnalysisScrape,
    staleTime: 5 * 60_000,
    retry: 0,
  });
}
