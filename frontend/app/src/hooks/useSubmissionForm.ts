import { useQuery } from "@tanstack/react-query";

import { fetchSubmissionFormData, type SubmissionFormData } from "@/lib/api/submission-form";
import { fetchUpstreamSubmitScrape } from "@/lib/api/upstream-scrape";
import { queryKeys } from "@/lib/query-keys";

/**
 * Loads the submit page's dropdown / config metadata.
 *
 * Strategy:
 *   1. Try this fork's `/api/v3/system/submission-form/` (rich, native).
 *   2. On 404 / network error, fall back to scraping the upstream
 *      `/submit/` HTML so the SPA still mirrors a vanilla CAPEv2 deploy.
 */
export function useSubmissionForm() {
  return useQuery<SubmissionFormData>({
    queryKey: queryKeys.system.submissionForm,
    queryFn: async () => {
      try {
        return await fetchSubmissionFormData();
      } catch (err) {
        // v3 endpoint missing — scrape upstream /submit/ HTML.
        const scraped = await fetchUpstreamSubmitScrape();
        return adaptScrapeToFormData(scraped);
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}

function adaptScrapeToFormData(
  s: Awaited<ReturnType<typeof fetchUpstreamSubmitScrape>>,
): SubmissionFormData {
  return {
    packages: s.packages.map((p) => ({
      name: p.name,
      value: p.value,
      summary: p.summary,
      description: p.description,
      platform: "windows",
    })),
    machines: s.machines,
    machine_tags: s.machine_tags,
    route_options: s.routes.map((r) => ({
      name: r.value,
      label: r.label,
      type: r.value === "none" ? "none" : "vpn",
    })),
    random_route: null,
    default_route: "none",
    config: {
      kernel: s.config.kernel,
      memory: s.config.memory,
      procmemory: s.config.procmemory,
      dlnexec: s.tabs.dlnexec,
      url_analysis: s.tabs.url,
      tags: s.machine_tags.length > 0,
      dist_master_storage_only: false,
      linux_on_gui: s.config.linux_on_gui,
      tlp: s.config.tlp,
      timeout: s.defaults.timeout,
      amsidump: s.config.amsidump,
      pre_script: s.config.pre_script,
      during_script: s.config.during_script,
      downloading_service: s.tabs.downloading_service,
      interactive_desktop: s.config.interactive_desktop,
    },
  };
}
