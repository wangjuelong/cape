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
  /** "Analysis Details" card — category/package/started/completed/duration/route/options. */
  analysis_info?: Record<string, string>;
  /** "Machine Information" card — name/label/manager/started_on/shutdown_on. */
  machine_info?: Record<string, string>;
  /** "File Information" card — name/type/size + md5/sha1/sha256/sha3/ssdeep/tlsh/crc32. */
  file_info?: Record<string, string>;
  /** "PE Information" accordion — versioninfo / sections / imports / exports / resources / overlay / misc. */
  pe_info?: PeInfo;
  /** Processing / signatures / reporting timing breakdown. */
  statistics_processing?: Record<string, Array<{ name: string; time: number }>>;
  /** Subfile Information — files extracted from overlay / archive. */
  subfiles?: SubfileEntry[];
  /** YARA / CAPE-YARA / ClamAV matches against the target file. */
  yara_matches?: YaraMatch[];
  /** VirusTotal summary. */
  virustotal?: Record<string, unknown>;
}

export interface PeInfo {
  versioninfo?: Array<{ name: string; value: string }>;
  sections?: Array<{
    name: string;
    raw_address: string;
    virtual_address: string;
    virtual_size: string;
    size_of_data: string;
    entropy: string;
    characteristics: string;
  }>;
  imports?: Array<{
    dll: string;
    functions: Array<{ name: string; address: string }>;
  }>;
  exports?: Array<{ name: string; address: string; ordinal: string }>;
  resources?: Array<{
    name: string;
    offset: string;
    size: string;
    filetype: string;
    language: string;
    sublanguage: string;
    entropy: string;
  }>;
  overlay?: { offset: string; size: string };
  misc?: Record<string, string>;
  digital_signers?: unknown[];
  peid_signatures?: unknown;
}

export interface SubfileEntry {
  method: string;
  name: string;
  path: string;
  type: string;
  size: number | null;
  md5: string;
  sha256: string;
}

export interface YaraMatch {
  source: string;
  name: string;
  meta: string;
}

export async function fetchReportSummary(taskId: number): Promise<ReportSummary> {
  const { data } = await apiClient.get<ReportSummary>(`/reports/${taskId}/summary/`);
  return data;
}

export interface ProcessEnviron {
  CommandLine?: string;
  MainExeBase?: string;
  MainExeSize?: string;
  Bitness?: string;
  DllBase?: string;
}

export interface ProcessSummary {
  pid: number | null;
  ppid: number | null;
  name: string;
  calls_count: number;
  chunk_count: number;
  // Upstream "process info banner" fields — empty strings on non-PE samples.
  module_path?: string;
  image_base?: string;
  size?: string;
  bitness?: string;
  first_seen?: string;
  environ?: ProcessEnviron;
}

export interface BehaviorSummary {
  platform: string | null;
  /** Recursive `{pid, name, command_line, children: [...]}` from CAPE. */
  processtree: unknown[];
  processes: ProcessSummary[];
  /** Upstream `detections2pid` map: pid (str) → list of signature names. */
  detections2pid?: Record<string, string[]>;
}

export async function fetchReportBehavior(taskId: number): Promise<BehaviorSummary> {
  const { data } = await apiClient.get<BehaviorSummary>(`/reports/${taskId}/behavior/`);
  return data;
}

export interface ApiCallArgument {
  name?: string;
  value?: string;
  pretty_value?: string;
}

export interface ApiCall {
  id?: number;
  thread_id?: string;
  category?: string | null;
  api?: string | null;
  status?: boolean | null;
  return_value?: string | null;
  pretty_return?: string;
  caller?: string;
  parentcaller?: string;
  repeated?: number;
  timestamp?: string | null;
  arguments?: ApiCallArgument[];
}

export interface BehaviorCallsPage {
  calls: ApiCall[];
  page: number;
  total_chunks: number;
  has_next: boolean;
}

/**
 * Filter parameters mirror upstream's
 * `/analysis/filtered/<id>/<pid>/<cat>/<apilist>/<caller>/<tid>/` endpoint:
 *   - category: one of `default|all|registry|filesystem|network|process|
 *               threading|services|sync|crypto|browser|device`
 *   - apifilter: comma-separated allow-list; items prefixed with `!` are
 *                negated (e.g. "CreateFile, !CloseHandle")
 *   - caller: literal substring match against caller / parentcaller hex
 *   - tid: thread id
 */
export interface BehaviorCallFilters {
  category?: string;
  apifilter?: string;
  caller?: string;
  tid?: string | number;
}

export async function fetchReportBehaviorCalls(
  taskId: number,
  pid: number,
  page = 0,
  filters: BehaviorCallFilters = {},
): Promise<BehaviorCallsPage> {
  const { data } = await apiClient.get<BehaviorCallsPage>(`/reports/${taskId}/behavior/calls/`, {
    params: { pid, page, ...filters },
  });
  return data;
}

export interface BehaviorSearchResponse {
  summary_hits: Record<string, string[]>;
  call_hits: Array<{ pid: number; process_name: string; call: ApiCall }>;
}

export async function fetchReportBehaviorSearch(
  taskId: number,
  q: string,
): Promise<BehaviorSearchResponse> {
  const { data } = await apiClient.get<BehaviorSearchResponse>(
    `/reports/${taskId}/behavior/search/`,
    { params: { q } },
  );
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
