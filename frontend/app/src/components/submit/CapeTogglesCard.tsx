import { Controller, type Control } from "react-hook-form";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

import type { SubmitFormValues } from "./form-types";

interface CapeTogglesCardProps {
  control: Control<SubmitFormValues>;
}

interface ToggleDef {
  name: keyof SubmitFormValues;
  label: string;
  hint?: string;
}

const LEFT_COLUMN: ToggleDef[] = [
  { name: "process_dump", label: "Disable process dumps" },
  { name: "process_memory", label: "Full process memory dumps" },
  { name: "amsidump", label: "AMSI dumps", hint: "Win10+" },
  { name: "import_reconstruction", label: "Import reconstruction" },
  { name: "memory", label: "Full memory dump", hint: "Volatility" },
  { name: "enforce_timeout", label: "Enforce timeout" },
  { name: "free", label: "No monitoring" },
  { name: "unpacker", label: "Active unpacking" },
  { name: "tor", label: "Tor routing" },
];

const RIGHT_COLUMN: ToggleDef[] = [
  { name: "syscall", label: "Syscall hooks", hint: "Win10+ — default on" },
  { name: "norefer", label: "No fake Referer header" },
  { name: "nohuman", label: "Disable human interaction module" },
  { name: "interactive", label: "Interactive desktop", hint: "Guacamole" },
  { name: "manual", label: "Manual detonation" },
  { name: "kernel_analysis", label: "Kernel analysis", hint: "zer0m0n" },
  { name: "static_config", label: "Try static config first", hint: "fall back to VM" },
  { name: "oldloader", label: "Thread-based monitor (legacy)" },
  { name: "screenshots_qr", label: "QR URL extraction" },
  { name: "mitmdump", label: "mitmproxy HTTPS capture" },
];

export function CapeTogglesCard({ control }: CapeTogglesCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Extended capabilities</CardTitle>
        <CardDescription>
          CAPE-specific toggles. They translate into the comma-separated{" "}
          <code className="font-mono text-[11px]" style={{ color: "var(--color-accent)" }}>
            options
          </code>{" "}
          string the analyzer reads (e.g. <code>procmemdump=1</code>, <code>nohuman=yes</code>).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {[LEFT_COLUMN, RIGHT_COLUMN].map((col, i) => (
            <div key={i} className="space-y-2">
              {col.map((t) => (
                <ToggleRow key={String(t.name)} control={control} def={t} />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ToggleRow({ control, def }: { control: Control<SubmitFormValues>; def: ToggleDef }) {
  return (
    <Controller
      control={control}
      name={def.name}
      render={({ field }) => (
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <Switch checked={!!field.value} onCheckedChange={field.onChange} />
          <span style={{ color: "var(--color-fg-1)" }}>
            {def.label}
            {def.hint && (
              <span className="ml-1.5 text-[10px]" style={{ color: "var(--color-fg-2)" }}>
                ({def.hint})
              </span>
            )}
          </span>
        </label>
      )}
    />
  );
}
