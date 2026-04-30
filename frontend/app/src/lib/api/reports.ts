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

export interface ProcessSummary {
  pid: number | null;
  ppid: number | null;
  name: string;
  calls_count: number;
  chunk_count: number;
}

export interface BehaviorSummary {
  platform: string | null;
  /** Recursive `{pid, name, command_line, children: [...]}` from CAPE. */
  processtree: unknown[];
  processes: ProcessSummary[];
}

export async function fetchReportBehavior(taskId: number): Promise<BehaviorSummary> {
  const { data } = await apiClient.get<BehaviorSummary>(`/reports/${taskId}/behavior/`);
  return data;
}

export interface ApiCallArgument {
  name?: string;
  value?: unknown;
}

export interface ApiCall {
  id?: number;
  thread_id?: number;
  category?: string | null;
  api?: string | null;
  status?: number | null;
  return_value?: string | null;
  timestamp?: string | null;
  arguments?: ApiCallArgument[] | unknown[];
}

export interface BehaviorCallsPage {
  calls: ApiCall[];
  page: number;
  total_chunks: number;
  has_next: boolean;
}

export async function fetchReportBehaviorCalls(
  taskId: number,
  pid: number,
  page = 0,
): Promise<BehaviorCallsPage> {
  const { data } = await apiClient.get<BehaviorCallsPage>(
    `/reports/${taskId}/behavior/calls/`,
    { params: { pid, page } },
  );
  return data;
}
