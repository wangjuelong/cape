import { apiClient } from "./client";
import type { TaskSummary } from "@/types/api";

export interface CompareCandidatesResponse {
  ok: boolean;
  left: TaskSummary | null;
  records: TaskSummary[];
  md5: string | null;
}

export interface CompareDiffResponse {
  ok: boolean;
  left: TaskSummary | null;
  right: TaskSummary | null;
  left_counts: Record<string, number>;
  right_counts: Record<string, number>;
  summary: Record<string, string[]>;
}

export async function fetchCompareCandidates(leftId: number): Promise<CompareCandidatesResponse> {
  const { data } = await apiClient.get<CompareCandidatesResponse>(`/compare/${leftId}/`);
  return data;
}

export async function fetchCompareDiff(
  leftId: number,
  rightId: number,
): Promise<CompareDiffResponse> {
  const { data } = await apiClient.get<CompareDiffResponse>(`/compare/${leftId}/${rightId}/`);
  return data;
}
