import { Controller, type Control, type UseFormRegister } from "react-hook-form";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { SubmissionFormData } from "@/lib/api/submission-form";

import type { SubmitFormValues } from "./form-types";

interface AdvancedOptionsCardProps {
  control: Control<SubmitFormValues>;
  register: UseFormRegister<SubmitFormValues>;
  formData?: SubmissionFormData;
  showReferrer?: boolean;
  showPreScripts?: boolean;
}

const ANY_MACHINE = "__any__";
const AUTO_PACKAGE = "__auto__";
const NO_TLP = "__none__";
const ANY_PLATFORM = "__any__";

export function AdvancedOptionsCard({
  control,
  register,
  formData,
  showReferrer = false,
  showPreScripts = false,
}: AdvancedOptionsCardProps) {
  const packages = formData?.packages ?? [];
  const machines = formData?.machines ?? [];
  const machineTags = formData?.machine_tags ?? [];
  const routeOptions = formData?.route_options ?? [];
  const config = formData?.config;

  const tlpEnabled = config?.tlp ?? true;
  const linuxOnGui = config?.linux_on_gui ?? false;
  const tagsHelpVisible = (config?.tags ?? false) && machineTags.length > 0;
  const preScriptEnabled = showPreScripts && (config?.pre_script ?? true);
  const duringScriptEnabled = showPreScripts && (config?.during_script ?? true);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Advanced options</CardTitle>
        <CardDescription>
          Mirrors upstream <code>web/submission</code> — every shared parameter is exposed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Package">
            <Controller
              control={control}
              name="package"
              render={({ field }) => {
                const value = field.value && field.value !== "" ? field.value : AUTO_PACKAGE;
                return (
                  <Select
                    value={value}
                    onValueChange={(v) => field.onChange(v === AUTO_PACKAGE ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Detect Automatically" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUTO_PACKAGE}>Detect Automatically</SelectItem>
                      {packages.map((p) => (
                        <SelectItem key={p.value} value={p.value} title={p.description}>
                          {p.name} — {p.summary}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              }}
            />
          </Field>

          <Field label="Timeout (s)">
            <Input
              type="number"
              min={0}
              placeholder={String(config?.timeout ?? 200)}
              {...register("timeout")}
            />
          </Field>

          <Field label="Priority">
            <Controller
              control={control}
              name="priority"
              render={({ field }) => (
                <Select
                  value={String(field.value ?? "1")}
                  onValueChange={(v) => field.onChange(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Low (1)</SelectItem>
                    <SelectItem value="2">Medium (2)</SelectItem>
                    <SelectItem value="3">High (3)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field label="Machine">
            <Controller
              control={control}
              name="machine"
              render={({ field }) => {
                const value = field.value && field.value !== "" ? field.value : ANY_MACHINE;
                return (
                  <Select
                    value={value}
                    onValueChange={(v) => field.onChange(v === ANY_MACHINE ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="First available" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY_MACHINE}>First available</SelectItem>
                      {machines.map((m) => (
                        <SelectItem key={m.value || "__all__"} value={m.value || "all"}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              }}
            />
          </Field>

          <Field label="Platform">
            <Controller
              control={control}
              name="platform"
              render={({ field }) => (
                <Select
                  value={field.value || ANY_PLATFORM}
                  onValueChange={(v) => field.onChange(v === ANY_PLATFORM ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_PLATFORM}>(auto)</SelectItem>
                    <SelectItem value="windows">windows</SelectItem>
                    <SelectItem value="linux">linux</SelectItem>
                    <SelectItem value="darwin">darwin</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field label="Network route">
            <Controller
              control={control}
              name="route"
              render={({ field }) => {
                const value = field.value || formData?.default_route || "none";
                return (
                  <Select value={value} onValueChange={(v) => field.onChange(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {routeOptions.map((r) => (
                        <SelectItem key={r.name} value={r.name} title={r.description ?? ""}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              }}
            />
          </Field>

          <Field
            label={
              tagsHelpVisible
                ? `Machine tags · available: ${machineTags.join(", ")}`
                : "Machine tags"
            }
          >
            <Input placeholder="tag1,tag2" {...register("tags")} />
          </Field>

          <Field label="Task tags (free-form labels)">
            <Input placeholder="campaign-1,internal" {...register("tags_tasks")} />
          </Field>

          <Field label="TLP">
            <Controller
              control={control}
              name="tlp"
              render={({ field }) => (
                <Select
                  value={field.value || NO_TLP}
                  onValueChange={(v) => field.onChange(v === NO_TLP ? "" : v)}
                  disabled={!tlpEnabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="White (default)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TLP}>White (default)</SelectItem>
                    <SelectItem value="Green">Green</SelectItem>
                    <SelectItem value="Amber">Amber</SelectItem>
                    <SelectItem value="Red">Red</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field label="Clock (MM-DD-YYYY HH:mm:ss)">
            <Input placeholder="(default: now)" {...register("clock")} />
          </Field>

          <Field label="Custom note">
            <Input placeholder="free text passed through to the report" {...register("custom")} />
          </Field>

          {showReferrer && (
            <Field label="Referrer">
              <Input placeholder="https://..." {...register("referrer")} />
            </Field>
          )}

          <div className="md:col-span-2">
            <Field label="Options (raw, comma-separated key=val)">
              <Input placeholder="bp0=ep,base-on-api=NtReadFile,..." {...register("options")} />
            </Field>
          </div>

          {linuxOnGui && (
            <div className="md:col-span-2">
              <Field label="Linux options (lin_options) — separate from `options`">
                <Input placeholder="filename=foo,timeout=120,..." {...register("lin_options")} />
              </Field>
            </div>
          )}

          {preScriptEnabled && (
            <Field label="Pre-execution script (runs before sample)">
              <Input type="file" {...register("pre_script")} />
            </Field>
          )}
          {duringScriptEnabled && (
            <Field label="During-execution script (runs alongside)">
              <Input type="file" {...register("during_script")} />
            </Field>
          )}
        </div>

        <div
          className="mt-3 flex flex-wrap gap-3 border-t pt-3"
          style={{ borderColor: "var(--color-border)" }}
        >
          <ToggleRow control={control} name="memory" label="Take guest memory dump (Volatility)" />
          <ToggleRow control={control} name="enforce_timeout" label="Enforce timeout" />
          <ToggleRow control={control} name="unique" label="Reject if sample already exists" />
        </div>
      </CardContent>
    </Card>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

interface ToggleRowProps {
  control: Control<SubmitFormValues>;
  name: keyof SubmitFormValues;
  label: string;
}

function ToggleRow({ control, name, label }: ToggleRowProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <Switch checked={!!field.value} onCheckedChange={field.onChange} />
          <span style={{ color: "var(--color-fg-1)" }}>{label}</span>
        </label>
      )}
    />
  );
}
