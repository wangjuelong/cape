import { apiClient } from "./client";

export interface PermissionContentType {
  app_label: string;
  model: string;
}

export interface Permission {
  id: number;
  name: string;
  codename: string;
  content_type: PermissionContentType;
}

export async function listPermissions(contentType?: string): Promise<Permission[]> {
  const params = contentType ? { content_type: contentType } : undefined;
  const { data } = await apiClient.get<{ data: Permission[] }>("/permissions/", { params });
  return data.data;
}
