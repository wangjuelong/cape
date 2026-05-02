import { apiClient } from "./client";
import type { CurrentUser } from "@/types/api";

export interface UpdateMePayload {
  first_name?: string;
  last_name?: string;
  email?: string;
}

export async function updateMe(payload: UpdateMePayload): Promise<CurrentUser> {
  const { data } = await apiClient.patch<CurrentUser>("/me/", payload);
  return data;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  await apiClient.post("/me/password/", payload);
}
