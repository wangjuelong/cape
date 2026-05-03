import { apiClient } from "./client";
import type { UserListResponse } from "./users";

export interface GroupListRow {
  id: number;
  name: string;
  permission_count: number;
  member_count: number;
}

export interface GroupDetail {
  id: number;
  name: string;
  permission_ids: number[];
  member_count: number;
}

export interface GroupListFilters {
  search?: string;
  cursor?: number;
  limit?: number;
}

export interface GroupListResponse {
  data: GroupListRow[];
  next_cursor: number | null;
  total: number;
}

export interface GroupCreatePayload {
  name: string;
  permission_ids?: number[];
}

export interface GroupUpdatePayload {
  name?: string;
  permission_ids?: number[];
}

export interface GroupBulkDeleteResponse {
  success: number[];
  failed: { id: number; reason: string }[];
}

export async function listGroups(
  filters: GroupListFilters = {},
): Promise<GroupListResponse> {
  const params: Record<string, string> = {};
  if (filters.search) params.search = filters.search;
  if (filters.cursor !== undefined) params.cursor = String(filters.cursor);
  if (filters.limit !== undefined) params.limit = String(filters.limit);
  const { data } = await apiClient.get<GroupListResponse>("/groups/", { params });
  return data;
}

export async function getGroup(id: number): Promise<GroupDetail> {
  const { data } = await apiClient.get<GroupDetail>(`/groups/${id}/`);
  return data;
}

export async function createGroup(payload: GroupCreatePayload): Promise<GroupDetail> {
  const { data } = await apiClient.post<GroupDetail>("/groups/", payload);
  return data;
}

export async function updateGroup(
  id: number,
  payload: GroupUpdatePayload,
): Promise<GroupDetail> {
  const { data } = await apiClient.patch<GroupDetail>(`/groups/${id}/`, payload);
  return data;
}

export async function deleteGroup(id: number): Promise<void> {
  await apiClient.delete(`/groups/${id}/`);
}

export async function bulkDeleteGroups(
  ids: number[],
): Promise<GroupBulkDeleteResponse> {
  const { data } = await apiClient.post<GroupBulkDeleteResponse>(
    "/groups/bulk-delete/",
    { ids },
  );
  return data;
}

export async function getGroupMembers(
  id: number,
  opts: { cursor?: number; limit?: number } = {},
): Promise<UserListResponse> {
  const params: Record<string, string> = {};
  if (opts.cursor !== undefined) params.cursor = String(opts.cursor);
  if (opts.limit !== undefined) params.limit = String(opts.limit);
  const { data } = await apiClient.get<UserListResponse>(
    `/groups/${id}/members/`,
    { params },
  );
  return data;
}

export async function setGroupMembers(
  id: number,
  user_ids: number[],
): Promise<UserListResponse> {
  const { data } = await apiClient.patch<UserListResponse>(
    `/groups/${id}/members/`,
    { user_ids },
  );
  return data;
}
