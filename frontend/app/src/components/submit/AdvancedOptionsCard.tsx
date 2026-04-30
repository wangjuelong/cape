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
import type { Machine } from "@/lib/api/machines";

import type { SubmitFormValues } from "./form-types";

interface AdvancedOptionsCardProps {
  control: Control<SubmitFormValues>;
  register: UseFormRegister<SubmitFormValues>;
  machines: Machine[];
  showReferrer?: boolean;
  showPreScripts?: boolean;
}

const ANY_MACHINE = "__any__";

export function AdvancedOptionsCard({
  control,
  register,
  machines,
  showReferrer = false,
  showPreScripts = false,
}: AdvancedOptionsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Advanced options</CardTitle>
        <CardDescription>
          The 18 shared submission parameters. Defaults match the legacy CAPE web UI.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Package">
            <Input placeholder="exe, dll, doc, pdf, ie, ps1..." {...register("package")} />
          </Field>
          <Field label="Timeout (s)">
            <Input type="number" min={0} placeholder="120" {...register("timeout")} />
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
                      <SelectValue placeholder="(any available)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY_MACHINE}>(any available)</SelectItem>
                      <SelectItem value="all">all machines</SelectItem>
                      {machines.map((m) => (
                        <SelectItem key={m.label} value={m.label}>
                          {m.label}
                          {m.platform ? ` · ${m.platform}` : ""}
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
                  value={field.value || "any"}
                  onValueChange={(v) => field.onChange(v === "any" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">any</SelectItem>
                    <SelectItem value="windows">windows</SelectItem>
                    <SelectItem value="linux">linux</SelectItem>
                    <SelectItem value="darwin">darwin</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Network route">
            <Input
              placeholder="none / internet / inetsim / tor / vpn:<name>"
              {...register("route")}
            />
          </Field>

          <Field label="Tags (machine selection)">
            <Input placeholder="x64,win10" {...register("tags")} />
          </Field>
          <Field label="Tags (task labels)">
            <Input placeholder="campaign-1,internal" {...register("tags_tasks")} />
          </Field>

          <Field label="TLP">
            <Controller
              control={control}
              name="tlp"
              render={({ field }) => (
                <Select
                  value={field.value || "none"}
                  onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">(none)</SelectItem>
                    <SelectItem value="white">White</SelectItem>
                    <SelectItem value="green">Green</SelectItem>
                    <SelectItem value="amber">Amber</SelectItem>
                    <SelectItem value="red">Red</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Clock (MM-DD-YYYY HH:mm:ss)">
            <Input placeholder="(default: now)" {...register("clock")} />
          </Field>

          <Field label="Custom note">
            <Input placeholder="free text passed through to report" {...register("custom")} />
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

          {showPreScripts && (
            <>
              <Field label="Pre-script (runs before sample)">
                <Input type="file" {...register("pre_script")} />
              </Field>
              <Field label="During-script (runs alongside)">
                <Input type="file" {...register("during_script")} />
              </Field>
            </>
          )}
        </div>

        <div
          className="mt-3 flex flex-wrap gap-3 border-t pt-3"
          style={{ borderColor: "var(--color-border)" }}
        >
          <ToggleRow control={control} name="memory" label="Take guest memory dump" />
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
