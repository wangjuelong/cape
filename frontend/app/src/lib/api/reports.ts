import { apiClient } from "./client";
import type { Severity, TaskSummary, Verdict } from "@/types/api";

export interface SignatureLite {
  name: string;
  description: string;
  severity: number;
  ttp: string[];
}

export interface ReportSummary {
  task: TaskSummary;
  available_sections: string[];
  tab_counts: Record<string, number | string>;
  signatures: SignatureLite[];
  score: number | null;
  severity: Severity;
  verdict: Verdict;
  family: string | null;
  behavior_summary?: Record<string, string[]>;
}

export async function fetchReportSummary(taskId: number): Promise<ReportSummary> {
  const { data } = await apiClient.get<ReportSummary>(`/reports/${taskId}/summary/`);
  return data;
}
