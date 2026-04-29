import { apiClient } from "./client";

export interface Machine {
  name: string;
  label: string;
  ip: string | null;
  platform: string | null;
  tags: string[];
  status: string | null;
  locked: boolean;
  locked_changed_on: string | null;
  snapshot: string | null;
  interface: string | null;
  reserved: boolean;
}

export async function fetchMachines(): Promise<Machine[]> {
  const { data } = await apiClient.get<Machine[]>("/machines/");
  return data;
}

export async function fetchMachine(name: string): Promise<Machine> {
  const { data } = await apiClient.get<Machine>(`/machines/${encodeURIComponent(name)}/`);
  return data;
}
