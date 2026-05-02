import { useQuery } from "@tanstack/react-query";

import { fetchSubmissionFormData, type SubmissionFormData } from "@/lib/api/submission-form";
import { queryKeys } from "@/lib/query-keys";

/**
 * Loads the submit page's dropdown / config metadata via apiv3
 * `/api/v3/system/submission-form/`.
 *
 * The previous "scrape upstream HTML on apiv3 failure" fallback has been
 * removed — apiv3 is now authoritative.
 */
export function useSubmissionForm() {
  return useQuery<SubmissionFormData>({
    queryKey: queryKeys.system.submissionForm,
    queryFn: () => fetchSubmissionFormData(),
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}
