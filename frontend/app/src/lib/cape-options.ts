/**
 * Helpers for the 17 CAPE-specific submission toggles that the upstream
 * web/submission/views.py serialises into the comma-separated `options`
 * string. Mirrors the conditional appends in upstream lines ~310–365.
 *
 * The mapping is intentionally lossless — when a toggle is on, we add
 * the same `key=value` token the v2 view would have added; when it's
 * off, we omit it. `syscall` is the only one whose presence inverts
 * the meaning (v2: `if NOT request.POST.get('syscall'): options += "syscall=0,"`),
 * so we treat `syscall=true` as default-on and only emit when unchecked.
 */

export interface CapeToggles {
  /** No monitoring (free run, mostly for benign baseline) */
  free?: boolean;
  /** Disable human.py interaction module */
  nohuman?: boolean;
  /** Capture HTTPS via mitmproxy */
  mitmdump?: boolean;
  /** Interactive Guacamole desktop session */
  interactive?: boolean;
  /** Manual detonation (only with `interactive`) */
  manual?: boolean;
  /** Tor routing for this analysis */
  tor?: boolean;
  /** Disable per-process dumps */
  process_dump?: boolean;
  /** Full process memory dumps */
  process_memory?: boolean;
  /** AMSI dumps (Win10+) */
  amsidump?: boolean;
  /** Import Address Table reconstruction */
  import_reconstruction?: boolean;
  /** Active unpacker (BP-on-write) */
  unpacker?: boolean;
  /** Syscall hooks — DEFAULT ON; toggle off to disable */
  syscall?: boolean;
  /** Kernel-mode analysis (zer0m0n) */
  kernel_analysis?: boolean;
  /** Suppress fake Referer header on URL tasks */
  norefer?: boolean;
  /** Use the legacy thread-based monitor */
  oldloader?: boolean;
  /** Try to extract config without VM, fall back to VM if it fails */
  static_config?: boolean;
  /** Extract & open URLs from QR codes in screenshots */
  screenshots_qr?: boolean;
}

/**
 * Build the `options` string from a base value (user-typed
 * comma-separated `key=val,key=val`) plus the toggle map. Returns a
 * trimmed string suitable for the v3 `options` field.
 */
export function buildOptionsString(base: string, toggles: CapeToggles): string {
  const parts: string[] = [];

  // Preserve user-typed key=val pairs, normalised (drop spaces, drop
  // trailing commas).
  if (base) {
    for (const piece of base.split(",")) {
      const p = piece.trim();
      if (!p) continue;
      // Skip pieces lacking '=' (matches v2 behaviour, line 293-295).
      if (!p.includes("=")) continue;
      parts.push(p);
    }
  }

  if (toggles.free) parts.push("free=yes");
  if (toggles.nohuman) parts.push("nohuman=yes");
  if (toggles.mitmdump) parts.push("mitmdump=yes");

  if (toggles.interactive) {
    parts.push("interactive=1");
    if (!toggles.nohuman) parts.push("nohuman=yes"); // v2 forces nohuman with interactive
    if (toggles.manual) parts.push("manual=1");
  }

  if (toggles.tor) parts.push("tor=yes");
  if (toggles.process_dump) parts.push("procdump=0");
  if (toggles.process_memory) parts.push("procmemdump=1");
  if (toggles.amsidump) parts.push("amsidump=1");
  if (toggles.import_reconstruction) parts.push("import_reconstruction=1");
  if (toggles.unpacker) parts.push("unpacker=2");
  // syscall is ON by default; only emit `syscall=0` when explicitly disabled
  if (toggles.syscall === false) parts.push("syscall=0");
  if (toggles.kernel_analysis) parts.push("kernel_analysis=yes");
  if (toggles.norefer) parts.push("norefer=1");
  if (toggles.oldloader) parts.push("no-iat=1");
  if (toggles.screenshots_qr) parts.push("screenshots_qr=yes");
  // Note: `static_config` (the in-options "try static first" toggle, not
  // the static-only submission tab) maps to upstream `unpack=yes` per
  // line 357. Keep that behaviour.
  if (toggles.static_config) parts.push("unpack=yes");

  return parts.join(",");
}

export const DEFAULT_TOGGLES: CapeToggles = {
  syscall: true, // mirrors upstream <input ... checked/>
};
