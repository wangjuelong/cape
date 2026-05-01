/**
 * Audit log API client + TS types.
 *
 * Mirrors backend `apiv3/serializers.py` AuditEventSerializer and
 * surrounding response wrappers. Keep these in sync — `audit_log/__init__.py`
 * `ACTIONS` is the source of truth for the action enum.
 */

import { apiClient } from "./client";

export interface AuditActor {
  user_id: number | null;
  username: string | null;
  ip: string | null;
  user_agent: string | null;
}

export interface AuditTarget {
  type: string | null;
  id: string | null;
  label: string | null;
}

export interface AuditEvent {
  id: number;
  timestamp: string; // ISO 8601 UTC
  actor: AuditActor;
  action: string;
  success: boolean;
  target: AuditTarget;
  metadata: Record<string, unknown>;
}

export interface AuditListResponse {
  data: AuditEvent[];
  next_cursor: string | null;
}

export type AuditActionCategory = "auth" | "user_mgmt" | "admin";

export interface AuditActionDescriptor {
  value: string;
  label: string;
  category: AuditActionCategory;
}

export interface AuditActionListResponse {
  data: AuditActionDescriptor[];
}

export interface AuditFilters {
  cursor?: string | null;
  limit?: number;
  actor?: string;
  action?: string | string[]; // serialized as comma-separated
  target_user?: string;
  target_type?: string;
  success?: boolean;
  since?: string; // ISO 8601
  until?: string;
  q?: string;
}

function serializeFilters(filters: AuditFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.cursor) out.cursor = filters.cursor;
  if (filters.limit !== undefined) out.limit = String(filters.limit);
  if (filters.actor) out.actor = filters.actor;
  if (filters.action) {
    out.action = Array.isArray(filters.action) ? filters.action.join(",") : filters.action;
  }
  if (filters.target_user) out.target_user = filters.target_user;
  if (filters.target_type) out.target_type = filters.target_type;
  if (filters.success !== undefined) out.success = String(filters.success);
  if (filters.since) out.since = filters.since;
  if (filters.until) out.until = filters.until;
  if (filters.q) out.q = filters.q;
  return out;
}

export async function fetchAuditEvents(
  filters: AuditFilters = {},
): Promise<AuditListResponse> {
  const { data } = await apiClient.get<AuditListResponse>("/audits/", {
    params: serializeFilters(filters),
  });
  return data;
}

export async function fetchAuditActions(): Promise<AuditActionListResponse> {
  const { data } = await apiClient.get<AuditActionListResponse>("/audits/actions/");
  return data;
}
