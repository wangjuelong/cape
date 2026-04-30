import { apiClient } from "./client";
import type { TaskListFilters, TaskSummary } from "@/types/api";

export interface TaskListPage {
  data: TaskSummary[];
  next_cursor: string | null;
}

export async function fetchTaskList(filters: TaskListFilters = {}): Promise<TaskListPage> {
  const params = new URLSearchParams();
  if (filters.status) {
    const status = Array.isArray(filters.status) ? filters.status.join(",") : filters.status;
    params.set("status", status);
  }
  if (filters.category) params.set("category", filters.category);
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.added_before) params.set("added_before", filters.added_before);

  const qs = params.toString();
  const { data } = await apiClient.get<TaskListPage>(`/tasks/${qs ? `?${qs}` : ""}`);
  return data;
}

export async function fetchTaskDetail(id: number): Promise<TaskSummary> {
  const { data } = await apiClient.get<TaskSummary>(`/tasks/${id}/`);
  return data;
}

export interface SubmitResponse {
  task_ids: number[];
  message: string;
  machines: string[];
  errors: unknown[];
}

/** Backwards-compat alias — older imports refer to this. */
export type SubmitFileResponse = SubmitResponse;

/**
 * Multipart file submission. The same endpoint accepts:
 *   - normal sample (default)
 *   - PCAP analysis (set form field `pcap=1`)
 *   - static-only (set form field `static=1`)
 *
 * Caller is responsible for setting the right boolean flag.
 */
export async function submitFile(form: FormData): Promise<SubmitResponse> {
  const { data } = await apiClient.post<SubmitResponse>("/tasks/file/", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export interface UrlSubmitPayload {
  url: string;
  package?: string;
  timeout?: number;
  priority?: number;
  options?: string;
  machine?: string;
  platform?: string;
  tags?: string;
  custom?: string;
  memory?: boolean;
  enforce_timeout?: boolean;
  clock?: string;
  referrer?: string;
  tlp?: string;
  tags_tasks?: string;
  route?: string;
}

export async function submitUrl(payload: UrlSubmitPayload): Promise<SubmitResponse> {
  const { data } = await apiClient.post<SubmitResponse>("/tasks/url/", payload);
  return data;
}

export interface DlnexecSubmitPayload {
  dlnexec: string;
  package?: string;
  timeout?: number;
  priority?: number;
  options?: string;
  machine?: string;
  platform?: string;
  tags?: string;
  custom?: string;
  memory?: boolean;
  enforce_timeout?: boolean;
  clock?: string;
  tlp?: string;
  tags_tasks?: string;
  route?: string;
}

export async function submitDlnexec(payload: DlnexecSubmitPayload): Promise<SubmitResponse> {
  const { data } = await apiClient.post<SubmitResponse>("/tasks/dlnexec/", payload);
  return data;
}

export interface DownloadServicesPayload {
  hashes: string;
  options?: string;
  custom?: string;
  machine?: string;
}

export async function submitDownloadServices(
  payload: DownloadServicesPayload,
): Promise<SubmitResponse> {
  const { data } = await apiClient.post<SubmitResponse>("/tasks/download_services/", payload);
  return data;
}
