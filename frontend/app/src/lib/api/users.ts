import { apiClient } from "./client";

export interface UserListRow {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  is_superuser: boolean;
  is_active: boolean;
  last_login: string | null;
  date_joined: string;
  group_count: number;
  has_token: boolean;
}

export type UserDetail = Omit<UserListRow, "group_count">;

export interface UserListFilters {
  search?: string;
  is_staff?: boolean;
  is_superuser?: boolean;
  is_active?: boolean;
  group?: string;
  has_token?: "yes" | "no";
  cursor?: number;
  limit?: number;
  ordering?: string;
}

export interface UserListResponse {
  data: UserListRow[];
  next_cursor: number | null;
  total: number;
}

export interface UserCreatePayload {
  username: string;
  password: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  is_staff?: boolean;
  is_superuser?: boolean;
  is_active?: boolean;
}

export interface UserUpdatePayload {
  email?: string;
  first_name?: string;
  last_name?: string;
  is_staff?: boolean;
  is_superuser?: boolean;
  is_active?: boolean;
}

export interface BulkActionPayload {
  ids: number[];
  action: "activate" | "deactivate" | "delete";
}

export interface BulkActionResponse {
  success: number[];
  failed: { id: number; reason: string }[];
}

export async function listUsers(filters: UserListFilters = {}): Promise<UserListResponse> {
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === "") continue;
    params[k] = String(v);
  }
  const { data } = await apiClient.get<UserListResponse>("/users/", { params });
  return data;
}

export async function getUser(id: number): Promise<UserDetail> {
  const { data } = await apiClient.get<UserDetail>(`/users/${id}/`);
  return data;
}

export async function createUser(payload: UserCreatePayload): Promise<UserDetail> {
  const { data } = await apiClient.post<UserDetail>("/users/", payload);
  return data;
}

export async function updateUser(id: number, payload: UserUpdatePayload): Promise<UserDetail> {
  const { data } = await apiClient.patch<UserDetail>(`/users/${id}/`, payload);
  return data;
}

export async function deleteUser(id: number): Promise<void> {
  await apiClient.delete(`/users/${id}/`);
}

export async function setUserPassword(id: number, password: string): Promise<void> {
  await apiClient.post(`/users/${id}/set-password/`, { password });
}

export async function activateUser(id: number): Promise<UserDetail> {
  const { data } = await apiClient.post<UserDetail>(`/users/${id}/activate/`);
  return data;
}

export async function deactivateUser(id: number): Promise<UserDetail> {
  const { data } = await apiClient.post<UserDetail>(`/users/${id}/deactivate/`);
  return data;
}

export async function bulkAction(payload: BulkActionPayload): Promise<BulkActionResponse> {
  const { data } = await apiClient.post<BulkActionResponse>("/users/bulk-action/", payload);
  return data;
}
