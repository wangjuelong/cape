import { apiClient } from "./client";

interface FeatureFlagsEnvelope {
  flags: Record<string, boolean>;
}

interface SystemInfoEnvelope {
  cape_version: string;
  api_version: string;
  python_version: string;
}

export async function fetchFeatureFlags(): Promise<Record<string, boolean>> {
  const { data } = await apiClient.get<FeatureFlagsEnvelope>("/system/feature-flags/");
  return data.flags;
}

export async function fetchSystemInfo(): Promise<SystemInfoEnvelope> {
  const { data } = await apiClient.get<SystemInfoEnvelope>("/system/info/");
  return data;
}
