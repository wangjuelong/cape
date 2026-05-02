/**
 * Types aligned with the v3 API contract from PRD §5.
 * The shapes mirror frontend/web-design/data.js so the existing design canvas
 * acts as a faithful spec for the generated SDK.
 */

export type Severity = "crit" | "high" | "med" | "low" | "clean";
export type Verdict = "malicious" | "suspicious" | "clean";

export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "reported"
  | "failed_analysis"
  | "failed_processing"
  | "failed_reporting";

export interface TaskSummary {
  id: number;
  target: string;
  sha256: string;
  sha1: string;
  md5: string;
  size: number;
  type: string;
  submitted: string;
  started: string | null;
  completed: string | null;
  duration: string | null;
  machine: string | null;
  package: string;
  score: number;
  severity: Severity;
  verdict: Verdict;
  family: string | null;
  signatures_count: number;
  yara_matches: number;
  network_count: number;
  files_dropped: number;
  payloads: number;
  api_calls: number;
  status: TaskStatus;
  tags: string[];
}

export interface TaskListFilters {
  status?: TaskStatus | TaskStatus[];
  category?: string;
  package?: string;
  family?: string;
  severity?: Severity;
  added_after?: string;
  added_before?: string;
  cursor?: string;
  limit?: number;
  sort?: string;
}

export interface SignatureMark {
  type: "call" | "file" | "registry" | "network" | "mutex" | "process" | "generic";
  pid?: number;
  api?: string;
  arguments?: Record<string, unknown>;
  detail?: string;
}

export interface Signature {
  name: string;
  description: string;
  severity: 1 | 2 | 3 | 4 | 5;
  categories: string[];
  ttp: string[];
  marks: SignatureMark[];
}

export interface AttackTechnique {
  id: string;
  name: string;
  matched: boolean;
  hits: number;
  signatures: string[];
  subtechniques?: AttackTechnique[];
}

export interface AttackTactic {
  id: string;
  name: string;
  techniques: AttackTechnique[];
}

export interface AttackMatrix {
  tactics: AttackTactic[];
  total_techniques: number;
  total_subtechniques: number;
}

export type SSEEvent =
  | { type: "task.status"; task_id: number; status: TaskStatus; ts: string }
  | { type: "task.added"; task_id: number; status: TaskStatus; ts: string }
  | { type: "task.deleted"; task_id: number; ts: string }
  | {
      type: "machine.status";
      name: string;
      status: "running" | "idle" | "maintenance";
      ts: string;
    }
  | { type: "heartbeat"; ts: string };

export interface ApiError {
  error: true;
  error_code: string;
  error_value: string;
  details?: Record<string, unknown>;
}

export interface ApiSuccess<T> {
  error: false;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    next_cursor?: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface CurrentUser {
  username: string;
  email: string | null;
  is_staff: boolean;
  is_superuser: boolean;
  subscription: string | null;
  reports_dl_allowed: boolean;
}
