import { useQuery } from "@tanstack/react-query";

import { fetchSubmissionFormData, type SubmissionFormData } from "@/lib/api/submission-form";
import { queryKeys } from "@/lib/query-keys";

export function useSubmissionForm() {
  return useQuery<SubmissionFormData>({
    queryKey: queryKeys.system.submissionForm,
    queryFn: fetchSubmissionFormData,
    staleTime: 5 * 60 * 1000,
  });
}
