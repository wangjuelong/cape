import type { AuditFilters } from "@/lib/api/audits";
import type { UserListFilters } from "@/lib/api/users";
import type { TaskListFilters } from "@/types/api";

export const queryKeys = {
  me: ["me"] as const,
  tasks: {
    all: ["tasks"] as const,
    list: (filters: TaskListFilters) => ["tasks", "list", filters] as const,
    detail: (id: number) => ["tasks", "detail", id] as const,
  },
  reports: {
    all: ["reports"] as const,
    summary: (id: number) => ["reports", id, "summary"] as const,
    static: (id: number) => ["reports", id, "static"] as const,
    behavior: (id: number) => ["reports", id, "behavior"] as const,
    behaviorCalls: (id: number, cursor?: string) =>
      ["reports", id, "behavior", "calls", cursor] as const,
    network: (id: number) => ["reports", id, "network"] as const,
    dropped: (id: number) => ["reports", id, "dropped"] as const,
    screenshots: (id: number) => ["reports", id, "screenshots"] as const,
    payloads: (id: number) => ["reports", id, "payloads"] as const,
    attack: (id: number) => ["reports", id, "attack"] as const,
    config: (id: number) => ["reports", id, "config"] as const,
    signatures: (id: number) => ["reports", id, "signatures"] as const,
  },
  machines: {
    all: ["machines"] as const,
    detail: (name: string) => ["machines", name] as const,
  },
  dashboard: {
    summary: ["dashboard", "summary"] as const,
    trends: (window: string) => ["dashboard", "trends", window] as const,
  },
  audits: {
    all: ["audits"] as const,
    list: (filters: AuditFilters) => ["audits", "list", filters] as const,
    actions: ["audits", "actions"] as const,
  },
  system: {
    info: ["system", "info"] as const,
    flags: ["system", "flags"] as const,
    submissionForm: ["system", "submission-form"] as const,
  },
  users: {
    all: ["users"] as const,
    list: (filters: UserListFilters) => ["users", "list", filters] as const,
    detail: (id: number) => ["users", "detail", id] as const,
  },
  groups: {
    all: ["groups"] as const,
    list: ["groups", "list"] as const,
  },
  permissions: {
    all: ["permissions"] as const,
    list: (contentType?: string) => ["permissions", "list", contentType ?? null] as const,
  },
  tokens: {
    me: ["tokens", "me"] as const,
    user: (id: number) => ["tokens", "user", id] as const,
  },
} as const;
