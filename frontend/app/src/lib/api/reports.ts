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
  const { data } = await apiClient.get<BehaviorCallsPage>(`/reports/${taskId}/behavior/calls/`, {
    params: { pid, page },
  });
  return data;
}

export interface StaticReport {
  static: Record<string, unknown>;
  target_file: Record<string, unknown>;
}

export async function fetchReportStatic(taskId: number): Promise<StaticReport> {
  const { data } = await apiClient.get<StaticReport>(`/reports/${taskId}/static/`);
  return data;
}

export interface AttackReport {
  ttps: unknown[];
  mitre_attck: unknown[];
}

export async function fetchReportAttack(taskId: number): Promise<AttackReport> {
  const { data } = await apiClient.get<AttackReport>(`/reports/${taskId}/attack/`);
  return data;
}

export interface ConfigReport {
  malware_conf: unknown[];
}

export async function fetchReportConfig(taskId: number): Promise<ConfigReport> {
  const { data } = await apiClient.get<ConfigReport>(`/reports/${taskId}/config/`);
  return data;
}

export interface NetworkReport {
  hosts: unknown[];
  domains: unknown[];
  tcp: unknown[];
  udp: unknown[];
  icmp: unknown[];
  smtp: unknown[];
  irc: unknown[];
  http: unknown[];
  suricata: {
    alerts: unknown[];
    tls: unknown[];
    http: unknown[];
    files: unknown[];
  };
}

export async function fetchReportNetwork(taskId: number): Promise<NetworkReport> {
  const { data } = await apiClient.get<NetworkReport>(`/reports/${taskId}/network/`);
  return data;
}

export interface DroppedReport {
  dropped: unknown[];
}

export async function fetchReportDropped(taskId: number): Promise<DroppedReport> {
  const { data } = await apiClient.get<DroppedReport>(`/reports/${taskId}/dropped/`);
  return data;
}

export interface PayloadsReport {
  payloads: unknown[];
}

export async function fetchReportPayloads(taskId: number): Promise<PayloadsReport> {
  const { data } = await apiClient.get<PayloadsReport>(`/reports/${taskId}/payloads/`);
  return data;
}

export interface ScreenshotEntry {
  index: number;
  url: string;
  thumbnail_url: string;
}

export interface ScreenshotsReport {
  count: number;
  shots: ScreenshotEntry[];
}

export async function fetchReportScreenshots(taskId: number): Promise<ScreenshotsReport> {
  const { data } = await apiClient.get<ScreenshotsReport>(`/reports/${taskId}/screenshots/`);
  return data;
}
