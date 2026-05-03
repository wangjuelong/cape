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
