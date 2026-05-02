import { apiClient } from "./client";
import type { TaskSummary } from "@/types/api";

export interface SearchPrefix {
  prefix: string;
  description: string;
  group: string;
}

export interface SearchResponse {
  ok: boolean;
  term: string;
  raw: string;
  error: string | null;
  items: TaskSummary[];
  // apiv3 echoes back the raw `value` query-param (the parsed search value).
  // The SPA does not currently consume it, but acknowledging it here keeps
  // TypeScript happy with the wire payload.
  value?: unknown;
}

export async function fetchSearchPrefixes(): Promise<SearchPrefix[]> {
  const { data } = await apiClient.get<{ prefixes: SearchPrefix[] }>("/search/prefixes/");
  return data.prefixes;
}

export async function fetchSearch(rawQuery: string): Promise<SearchResponse> {
  const { data } = await apiClient.get<SearchResponse>("/search/", {
    params: { search: rawQuery },
  });
  return data;
}
