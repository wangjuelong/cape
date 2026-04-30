import { apiClient } from "./client";

export interface SubmissionPackage {
  name: string;
  value: string;
  summary: string;
  description: string;
  platform: string;
}

export interface SubmissionMachine {
  value: string;
  label: string;
}

export interface SubmissionRouteOption {
  name: string;
  label: string;
  type: string;
  description?: string | null;
}

export interface SubmissionConfigGates {
  kernel: boolean;
  memory: boolean;
  procmemory: boolean;
  dlnexec: boolean;
  url_analysis: boolean;
  tags: boolean;
  dist_master_storage_only: boolean;
  linux_on_gui: boolean;
  tlp: boolean;
  timeout: number;
  amsidump: boolean;
  pre_script: boolean;
  during_script: boolean;
  downloading_service: boolean;
  interactive_desktop: boolean;
}

export interface SubmissionFormData {
  packages: SubmissionPackage[];
  machines: SubmissionMachine[];
  machine_tags: string[];
  route_options: SubmissionRouteOption[];
  random_route: SubmissionRouteOption | null;
  default_route: string;
  config: SubmissionConfigGates;
}

export async function fetchSubmissionFormData(): Promise<SubmissionFormData> {
  const { data } = await apiClient.get<SubmissionFormData>("/system/submission-form/");
  return data;
}
