/**
 * Fallback for when our v3 endpoints aren't available — fetches the
 * upstream Django `/submit/` HTML and parses it to discover which tabs,
 * toggles and form fields the deployment exposes.
 *
 * Lets the SPA render an identical visible feature set to upstream even
 * when running against a vanilla CAPEv2 Django without our v3 app.
 */

export interface UpstreamScrapeResult {
  /** tab key → present in upstream HTML */
  tabs: {
    file: boolean;
    pcap: boolean;
    static: boolean;
    url: boolean;
    dlnexec: boolean;
    downloading_service: boolean;
    resubmit: boolean;
  };
  /** Extended-capability checkbox names present in upstream HTML */
  toggles: Set<string>;
  /** Packages parsed from <select id="form_package"> */
  packages: Array<{ value: string; name: string; summary: string; description: string }>;
  /** Machines parsed from <select id="form_machine"> */
  machines: Array<{ value: string; label: string }>;
  /** Routes parsed from <select id="form_route"> */
  routes: Array<{ value: string; label: string }>;
  /** Available machine tags string (from #tagshelp content) */
  machine_tags: string[];
  /** Defaults */
  defaults: {
    timeout: number;
    priority: number;
  };
  /** TLP / linux options visibility */
  config: {
    tlp: boolean;
    linux_on_gui: boolean;
    pre_script: boolean;
    during_script: boolean;
    procmemory: boolean;
    amsidump: boolean;
    memory: boolean;
    interactive_desktop: boolean;
    kernel: boolean;
  };
}

const DEFAULT_RESULT: UpstreamScrapeResult = {
  tabs: {
    file: false,
    pcap: false,
    static: false,
    url: false,
    dlnexec: false,
    downloading_service: false,
    resubmit: false,
  },
  toggles: new Set(),
  packages: [],
  machines: [],
  routes: [],
  machine_tags: [],
  defaults: { timeout: 200, priority: 2 },
  config: {
    tlp: false,
    linux_on_gui: false,
    pre_script: false,
    during_script: false,
    procmemory: false,
    amsidump: false,
    memory: false,
    interactive_desktop: false,
    kernel: false,
  },
};

export async function fetchUpstreamSubmitScrape(): Promise<UpstreamScrapeResult> {
  // The SPA owns the `/submit` route too, so we proxy through a dedicated
  // path that Vite (and the reverse proxy in prod) rewrite to `/submit/`
  // on the upstream Django.
  const resp = await fetch("/_upstream/submit/", {
    credentials: "include",
    headers: { Accept: "text/html" },
  });
  if (!resp.ok) {
    throw new Error(`upstream /submit/ → HTTP ${resp.status}`);
  }
  const html = await resp.text();
  return parseUpstreamSubmitHtml(html);
}

export function parseUpstreamSubmitHtml(html: string): UpstreamScrapeResult {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const result: UpstreamScrapeResult = {
    ...DEFAULT_RESULT,
    tabs: { ...DEFAULT_RESULT.tabs },
    toggles: new Set(DEFAULT_RESULT.toggles),
    config: { ...DEFAULT_RESULT.config },
    defaults: { ...DEFAULT_RESULT.defaults },
  };

  // ----- Tabs -----
  // Upstream renders <a id="X-tab" href="#X" data-bs-toggle="pill"> for each
  // visible tab. Detect via the `id` attribute.
  const tabIdMap: Record<string, keyof UpstreamScrapeResult["tabs"]> = {
    "file-tab": "file",
    "pcap-tab": "pcap",
    "static-tab": "static",
    "url-tab": "url",
    "dlnexec-tab": "dlnexec",
    "dl-service-tab": "downloading_service",
    "resubmit-tab": "resubmit",
  };
  for (const a of doc.querySelectorAll("a[id$='-tab']")) {
    const id = a.getAttribute("id");
    if (id && id in tabIdMap) result.tabs[tabIdMap[id]] = true;
  }
  // Upstream always renders File tab even when others are hidden — file inputs
  // confirm presence regardless.
  if (doc.querySelector("input[name='sample']")) result.tabs.file = true;
  if (doc.querySelector("input[name='pcap']")) result.tabs.pcap = true;
  if (doc.querySelector("input[name='static'][type='file']")) result.tabs.static = true;
  if (doc.querySelector("input[name='url']")) result.tabs.url = true;
  if (doc.querySelector("input[name='dlnexec']")) result.tabs.dlnexec = true;
  if (doc.querySelector("input[name='hashes']")) result.tabs.downloading_service = true;
  if (doc.querySelector("input[name='hash']")) result.tabs.resubmit = true;

  // ----- Extended toggles -----
  // Upstream's form-check checkboxes inside #extendedCheckboxes.
  for (const cb of doc.querySelectorAll(
    "#extendedCheckboxes input[type='checkbox'][name]",
  )) {
    const name = cb.getAttribute("name");
    if (name) result.toggles.add(name);
    // upstream binds the static_config checkbox to name="static" — alias it
    // back to our internal name so the SPA still renders it.
    if (cb.getAttribute("id") === "static_config") result.toggles.add("static_config");
  }

  // Config gates inferred from which toggle ids are rendered
  result.config.procmemory = result.toggles.has("process_memory");
  result.config.amsidump = result.toggles.has("amsidump");
  result.config.memory = result.toggles.has("memory");
  result.config.kernel = result.toggles.has("kernel_analysis");
  result.config.interactive_desktop = result.toggles.has("interactive");

  // ----- TLP visible? -----
  result.config.tlp = !!doc.querySelector("select[name='tlp']");

  // ----- Linux options? -----
  result.config.linux_on_gui = !!doc.querySelector("input[name='lin_options']");

  // ----- Pre/during scripts? -----
  result.config.pre_script = !!doc.querySelector("input[name='pre_script']");
  result.config.during_script = !!doc.querySelector("input[name='during_script']");

  // ----- Packages -----
  const pkgSelect = doc.querySelector("select[name='package']");
  if (pkgSelect) {
    for (const opt of pkgSelect.querySelectorAll("option")) {
      const value = opt.getAttribute("value") ?? "";
      if (!value) continue;
      const text = (opt.textContent ?? "").trim();
      const dashIdx = text.indexOf(" - ");
      const name = dashIdx > 0 ? text.slice(0, dashIdx) : text;
      const summary = dashIdx > 0 ? text.slice(dashIdx + 3) : "";
      const description = opt.getAttribute("title") ?? "";
      result.packages.push({ value, name, summary, description });
    }
  }

  // ----- Machines -----
  const machineSelect = doc.querySelector("select[name='machine']");
  if (machineSelect) {
    for (const opt of machineSelect.querySelectorAll("option")) {
      result.machines.push({
        value: opt.getAttribute("value") ?? "",
        label: (opt.textContent ?? "").trim(),
      });
    }
  }

  // ----- Routes -----
  const routeSelect = doc.querySelector("select[name='route']");
  if (routeSelect) {
    for (const opt of routeSelect.querySelectorAll("option")) {
      result.routes.push({
        value: opt.getAttribute("value") ?? "",
        label: (opt.textContent ?? "").trim(),
      });
    }
  }

  // ----- Machine tags -----
  // upstream renders them inside `#tagshelp` as <code>tag</code>.
  for (const code of doc.querySelectorAll("#tagshelp code")) {
    const tag = (code.textContent ?? "").trim();
    if (tag) result.machine_tags.push(tag);
  }

  // ----- Defaults -----
  const timeoutInput = doc.querySelector("input[name='timeout']");
  if (timeoutInput) {
    const v = Number(timeoutInput.getAttribute("value"));
    if (Number.isFinite(v) && v > 0) result.defaults.timeout = v;
  }
  const priSelect = doc.querySelector("select[name='priority']");
  if (priSelect) {
    const sel = priSelect.querySelector("option[selected]");
    if (sel) {
      const v = Number(sel.getAttribute("value"));
      if (Number.isFinite(v) && v > 0) result.defaults.priority = v;
    }
  }

  return result;
}
