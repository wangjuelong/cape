import { apiClient } from "./client";

export interface TokenInfo {
  key: string | null;
  created: string | null;
}

export async function getMyToken(): Promise<TokenInfo> {
  const { data } = await apiClient.get<TokenInfo>("/me/token/");
  return data;
}

export async function rotateMyToken(): Promise<TokenInfo> {
  const { data } = await apiClient.post<TokenInfo>("/me/token/");
  return data;
}

export async function revokeMyToken(): Promise<void> {
  await apiClient.delete("/me/token/");
}

export async function getUserToken(userId: number): Promise<TokenInfo> {
  const { data } = await apiClient.get<TokenInfo>(`/users/${userId}/token/`);
  return data;
}

export async function rotateUserToken(userId: number): Promise<TokenInfo> {
  const { data } = await apiClient.post<TokenInfo>(`/users/${userId}/token/`);
  return data;
}

export async function revokeUserToken(userId: number): Promise<void> {
  await apiClient.delete(`/users/${userId}/token/`);
}

// ---------------------------------------------------------------------------
// Admin tokens aggregate list (sub-spec #3)
// ---------------------------------------------------------------------------

export interface AdminTokenRow {
  user_id: number;
  username: string;
  email: string;
  is_staff: boolean;
  is_active: boolean;
  has_token: boolean;
  token_created: string | null;
}

export interface AdminTokensListResponse {
  data: AdminTokenRow[];
  next_cursor: number | null;
  total: number;
}

export interface AdminTokensListFilters {
  search?: string;
  has_token?: "all" | "yes" | "no";
  cursor?: number;
  limit?: number;
}

export async function listAdminTokens(
  filters: AdminTokensListFilters = {},
): Promise<AdminTokensListResponse> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.has_token && filters.has_token !== "all") {
    params.set("has_token", filters.has_token);
  }
  if (filters.cursor !== undefined) params.set("cursor", String(filters.cursor));
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  const qs = params.toString();
  const { data } = await apiClient.get<AdminTokensListResponse>(
    `/tokens/${qs ? `?${qs}` : ""}`,
  );
  return data;
}
