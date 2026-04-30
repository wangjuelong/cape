/** Shape of the unified submit form. The discriminator `mode` decides
 *  which primary input is required at runtime; everything else is shared.
 */
export type SubmitMode =
  | "file"
  | "url"
  | "dlnexec"
  | "downloading_service"
  | "pcap"
  | "static"
  | "resubmit";

export interface SubmitFormValues {
  // Primary inputs (one required per mode)
  files?: FileList | null;
  url?: string;
  dlnexec?: string;
  hashes?: string;

  // Optional script uploads (file/sample mode only)
  pre_script?: FileList | null;
  during_script?: FileList | null;

  // 18 shared parameters
  package?: string;
  timeout?: number;
  priority?: number;
  options?: string;
  /** Linux-only options (separate dictionary, gated by web.conf [linux] enabled). */
  lin_options?: string;
  machine?: string;
  platform?: string;
  tags?: string;
  tags_tasks?: string;
  custom?: string;
  clock?: string;
  memory?: boolean;
  enforce_timeout?: boolean;
  unique?: boolean;
  referrer?: string;
  tlp?: string;
  route?: string;
  /** Resubmit-only: hash + optional task category override. */
  hash?: string;
  job_category?: "sample" | "static" | "pcap" | "dlnexec" | "vtdl" | "bazaar";

  // 17 CAPE option toggles (serialised into the `options` string)
  free?: boolean;
  nohuman?: boolean;
  mitmdump?: boolean;
  interactive?: boolean;
  manual?: boolean;
  tor?: boolean;
  process_dump?: boolean;
  process_memory?: boolean;
  amsidump?: boolean;
  import_reconstruction?: boolean;
  unpacker?: boolean;
  syscall?: boolean;
  kernel_analysis?: boolean;
  norefer?: boolean;
  oldloader?: boolean;
  static_config?: boolean;
  screenshots_qr?: boolean;
}

/**
 * Defaults match upstream `web/submission/index.html` rendering:
 *   - priority   = 2 (Medium) — selected option in the priority dropdown
 *   - timeout    = 200          — `value="{{ config.timeout }}"`
 *   - syscall    = true         — checkbox rendered with `checked`
 *   - rest       = false        — unchecked by default
 */
export const SUBMIT_DEFAULTS: SubmitFormValues = {
  priority: 2,
  timeout: 200,
  memory: false,
  enforce_timeout: false,
  unique: false,
  syscall: true,
};
