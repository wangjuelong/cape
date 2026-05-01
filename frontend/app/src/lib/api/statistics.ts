import { apiClient } from "./client";

export interface TaskDayRow {
  day: string;
  added: number;
  reported: number;
  failed: number;
}

export interface ModuleRow {
  name: string;
  total: number;
  runs: number;
  avg: number;
}

export interface StatisticsResponse {
  days: number;
  total: number;
  average: number;
  tasks_per_day: TaskDayRow[];
  processing: ModuleRow[];
  signatures: ModuleRow[];
  reporting: ModuleRow[];
  custom_statistics: ModuleRow[];
  top_samples: { day: string; sha256: string; count: number }[];
  detections: { family: string; count: number }[];
  asns: { asn: string; count: number }[];
  distributed_tasks: { day: string; node: string; count: number }[];
  error: string | null;
}

export async function fetchStatistics(days: number): Promise<StatisticsResponse> {
  const { data } = await apiClient.get<StatisticsResponse>(`/statistics/${days}/`);
  return data;
}
