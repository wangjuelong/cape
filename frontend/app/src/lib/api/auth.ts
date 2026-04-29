import { apiClient } from "./client";
import type { CurrentUser } from "@/types/api";

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const { data } = await apiClient.get<{ data: CurrentUser }>("/me/");
  return data.data;
}
