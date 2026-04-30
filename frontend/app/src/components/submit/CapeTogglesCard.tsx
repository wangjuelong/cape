import { useState } from "react";
import { Controller, useWatch, type Control } from "react-hook-form";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { SubmissionFormData } from "@/lib/api/submission-form";

import { HiddenMirror } from "./HiddenMirror";
import type { SubmitFormValues } from "./form-types";

interface CapeTogglesCardProps {
  control: Control<SubmitFormValues>;
  formData?: SubmissionFormData;
}

interface ToggleDef {
  name: keyof SubmitFormValues;
  label: string;
  hint?: string;
  /** key under formData.config that gates this toggle (matches upstream
   *  index.html `{% if config.X %}` blocks). Missing → always rendered. */
  configGate?:
    | "procmemory"
    | "amsidump"
    | "memory"
    | "interactive_desktop"
    | "kernel";
  /** Disable + uncheck unless the named other field is true (only used
   *  for `manual`, which upstream marks `disabled` until `interactive`
   *  is checked — see index.html syncManualCheckbox). */
  enableWhen?: keyof SubmitFormValues;
}

// Mirror upstream `web/submission/index.html` Extended Capabilities panel
// exactly: same names, same column split, same hints. Upstream POST handler
// also reads `tor` and `mitmdump` but those are NOT exposed via the
// template — `tor` is selected via the route dropdown instead, `mitmdump`
// is options-string only.

const LEFT_COLUMN: ToggleDef[] = [
  { name: "process_dump", label: "Disable process dumps" },
  { name: "process_memory", label: "Full process memory dumps", configGate: "procmemory" },
  { name: "amsidump", label: "AMSI dumps", hint: "Win10+", configGate: "amsidump" },
  { name: "import_reconstruction", label: "Import reconstruction" },
  { name: "memory", label: "Full memory dump", hint: "Volatility", configGate: "memory" },
  { name: "enforce_timeout", label: "Enforce timeout" },
  { name: "free", label: "No monitoring" },
  { name: "unpacker", label: "Active unpacking" },
];

const RIGHT_COLUMN: ToggleDef[] = [
  { name: "syscall", label: "Syscall hooks", hint: "Win10+ — default on" },
  { name: "norefer", label: "No fake Referer header" },
  { name: "nohuman", label: "Disable human interaction module" },
  {
    name: "interactive",
    label: "Interactive desktop",
    hint: "Guacamole",
    configGate: "interactive_desktop",
  },
  {
    name: "manual",
    label: "Manual detonation",
    configGate: "interactive_desktop",
    enableWhen: "interactive",
  },
  { name: "kernel_analysis", label: "Kernel analysis", hint: "zer0m0n", configGate: "kernel" },
  { name: "static_config", label: "Try static config first", hint: "fall back to VM" },
  { name: "oldloader", label: "Thread-based monitor (legacy)" },
  { name: "screenshots_qr", label: "QR URL extraction" },
];

/**
 * Conservative gating — when formData is undefined (e.g. SPA pointing at
 * an upstream Django without our v3 endpoint) we hide every config-gated
 * toggle so the visible set matches the most restrictive upstream deploy.
 */
function isToggleVisible(t: ToggleDef, config: SubmissionFormData["config"] | undefined) {
  if (!t.configGate) return true;
  return config?.[t.configGate] === true;
}

export function CapeTogglesCard({ control, formData }: CapeTogglesCardProps) {
  const config = formData?.config;
  // Upstream's "Toggle Extended Capabilities" button collapses this whole
  // section by default — keep parity (Bootstrap `collapse` initial state).
  const [open, setOpen] = useState(false);

  const interactive = useWatch({ control, name: "interactive" });

  const left = LEFT_COLUMN.filter((t) => isToggleVisible(t, config));
  const right = RIGHT_COLUMN.filter((t) => isToggleVisible(t, config));
  const totalVisible = left.length + right.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Extended capabilities</CardTitle>
        <CardDescription>
          {totalVisible} CAPE toggles · serialised into the{" "}
          <code className="font-mono text-[11px]" style={{ color: "var(--color-accent)" }}>
            options
          </code>{" "}
          string the analyzer reads.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Mirror upstream's "Toggle Extended Capabilities" collapse button.
            Defaults closed so the form stays compact on first render. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="btn"
          aria-expanded={open}
          aria-controls="extendedCheckboxes"
          style={{
            width: "100%",
            justifyContent: "center",
            background: "transparent",
            borderColor: "var(--color-border-strong)",
            color: "var(--color-fg-1)",
          }}
        >
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span>Toggle Extended Capabilities ({totalVisible})</span>
        </button>

        {/* Always render the Controllers (so HiddenMirror inputs stay in
            DOM regardless of collapse state — the form must submit toggle
            values even on first paint). The Switch UI itself is conditional. */}
        <div
          id="extendedCheckboxes"
          className="grid grid-cols-1 gap-2 md:grid-cols-2"
          style={{ marginTop: open ? 12 : 0 }}
        >
          {[left, right].map((col, i) => (
            <div key={i} className="space-y-2">
              {col.map((t) => (
                <ToggleRow
                  key={String(t.name)}
                  control={control}
                  def={t}
                  visible={open}
                  forceDisabled={t.enableWhen === "interactive" && !interactive}
                />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface ToggleRowProps {
  control: Control<SubmitFormValues>;
  def: ToggleDef;
  visible: boolean;
  forceDisabled?: boolean;
}

function ToggleRow({ control, def, visible, forceDisabled }: ToggleRowProps) {
  return (
    <Controller
      control={control}
      name={def.name}
      render={({ field }) => {
        // Mirror upstream's syncManualCheckbox: when forceDisabled is true,
        // automatically uncheck so we don't submit a stale value.
        if (forceDisabled && field.value) {
          field.onChange(false);
        }
        // The hidden mirror MUST always render so DOM-introspection (parity
        // tests, noscript fallback) sees the field name. The visible label
        // + Switch only render when the section is expanded.
        return (
          <>
            <HiddenMirror name={String(def.name)} value={field.value} />
            {visible && (
              <label
                className="flex items-center gap-2 text-xs"
                style={{
                  cursor: forceDisabled ? "not-allowed" : "pointer",
                  opacity: forceDisabled ? 0.5 : 1,
                }}
              >
                <Switch
                  checked={!!field.value && !forceDisabled}
                  onCheckedChange={field.onChange}
                  disabled={forceDisabled}
                />
                <span style={{ color: "var(--color-fg-1)" }}>
                  {def.label}
                  {def.hint && (
                    <span
                      className="ml-1.5 text-[10px]"
                      style={{ color: "var(--color-fg-2)" }}
                    >
                      ({def.hint})
                    </span>
                  )}
                </span>
              </label>
            )}
          </>
        );
      }}
    />
  );
}
