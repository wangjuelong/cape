import { apiClient } from "./client";

export interface Group {
  id: number;
  name: string;
  permission_count: number;
}

export async function listGroups(): Promise<Group[]> {
  const { data } = await apiClient.get<{ data: Group[] }>("/groups/");
  return data.data;
}
