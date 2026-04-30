import { Controller, useWatch, type Control, type UseFormRegister } from "react-hook-form";

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
import type { SubmissionFormData } from "@/lib/api/submission-form";

import { HiddenMirror } from "./HiddenMirror";
import type { SubmitFormValues } from "./form-types";

// Mirror upstream `data-color` attributes from index.html — the live
// /submit/ page colors the priority/TLP option text by severity.
const PRIORITY_COLOR: Record<string, string> = {
  "1": "#0dcaf0", // Low — info cyan
  "2": "#ffc107", // Medium — warning amber
  "3": "#dc3545", // High — danger red
};
const TLP_COLOR: Record<string, string> = {
  "": "#ffffff",
  Green: "#198754",
  Amber: "#ffc107",
  Red: "#dc3545",
};

interface AdvancedOptionsCardProps {
  control: Control<SubmitFormValues>;
  register: UseFormRegister<SubmitFormValues>;
  formData?: SubmissionFormData;
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
  showPreScripts = false,
}: AdvancedOptionsCardProps) {
  const packages = formData?.packages ?? [];
  const machines = formData?.machines ?? [];
  const machineTags = formData?.machine_tags ?? [];
  const routeOptions = formData?.route_options ?? [];
  const config = formData?.config;

  // Conservative defaults — mirror upstream's `enabledconf` gating: when
  // the SPA can't reach /api/v3/system/submission-form/ (e.g. against a
  // vanilla upstream Django) we fall back to "hide unless explicitly
  // enabled" so we never render a field upstream would have hidden.
  const tlpEnabled = config?.tlp === true;
  const linuxOnGui = config?.linux_on_gui === true;
  const tagsHelpVisible = config?.tags === true && machineTags.length > 0;
  const preScriptEnabled = showPreScripts && config?.pre_script !== false;
  const duringScriptEnabled = showPreScripts && config?.during_script !== false;

  // Watch package selection so we can render the description below the
  // dropdown — mirrors upstream's `$('#form_package').change(...)` JS.
  const packageValue = useWatch({ control, name: "package" });
  const selectedPackage = packages.find((p) => p.value === packageValue);

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
                  <>
                    <HiddenMirror name="package" value={field.value} />
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
                  </>
                );
              }}
            />
            {/* Mirror upstream's <small id="package_description">{title}</small>
                — show the selected package's description below the select. */}
            {selectedPackage?.description && (
              <p
                id="package_description"
                className="dim mono"
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.5,
                }}
              >
                {selectedPackage.description}
              </p>
            )}
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
              render={({ field }) => {
                const v = String(field.value ?? "2");
                const color = PRIORITY_COLOR[v];
                return (
                  <>
                    <HiddenMirror name="priority" value={field.value} />
                    <Select value={v} onValueChange={(nv) => field.onChange(Number(nv))}>
                      <SelectTrigger style={color ? { color } : undefined}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1" style={{ color: PRIORITY_COLOR["1"] }}>
                          Low
                        </SelectItem>
                        <SelectItem value="2" style={{ color: PRIORITY_COLOR["2"] }}>
                          Medium
                        </SelectItem>
                        <SelectItem value="3" style={{ color: PRIORITY_COLOR["3"] }}>
                          High
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                );
              }}
            />
          </Field>

          <Field label="Machine">
            <Controller
              control={control}
              name="machine"
              render={({ field }) => {
                const value = field.value && field.value !== "" ? field.value : ANY_MACHINE;
                return (
                  <>
                    <HiddenMirror name="machine" value={field.value} />
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
                  </>
                );
              }}
            />
          </Field>

          {/* Platform select — only meaningful on multi-platform deploys.
              Upstream's index.html doesn't render a separate platform field
              (the machine label encodes platform). Show only when web.conf
              [linux] enabled, matching upstream's "linux on gui" gate. */}
          {linuxOnGui && (
            <Field label="Platform">
              <Controller
                control={control}
                name="platform"
                render={({ field }) => (
                  <>
                    <HiddenMirror name="platform" value={field.value} />
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
                  </>
                )}
              />
            </Field>
          )}

          <Field label="Network route">
            <Controller
              control={control}
              name="route"
              render={({ field }) => {
                const value = field.value || formData?.default_route || "none";
                return (
                  <>
                    <HiddenMirror name="route" value={field.value} />
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
                  </>
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

          {tlpEnabled && (
            <Field label="TLP">
              <Controller
                control={control}
                name="tlp"
                render={({ field }) => {
                  const v = field.value || "";
                  const color = TLP_COLOR[v];
                  return (
                    <>
                      <HiddenMirror name="tlp" value={field.value} />
                      <Select
                        value={v || NO_TLP}
                        onValueChange={(nv) => field.onChange(nv === NO_TLP ? "" : nv)}
                      >
                        <SelectTrigger style={color ? { color } : undefined}>
                          <SelectValue placeholder="White" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_TLP} style={{ color: TLP_COLOR[""] }}>
                            White
                          </SelectItem>
                          <SelectItem value="Green" style={{ color: TLP_COLOR.Green }}>
                            Green
                          </SelectItem>
                          <SelectItem value="Amber" style={{ color: TLP_COLOR.Amber }}>
                            Amber
                          </SelectItem>
                          <SelectItem value="Red" style={{ color: TLP_COLOR.Red }}>
                            Red
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </>
                  );
                }}
              />
            </Field>
          )}

          <Field label="Clock (MM-DD-YYYY HH:mm:ss)">
            <Input placeholder="(default: now)" {...register("clock")} />
          </Field>

          <Field label="Custom note">
            <Input placeholder="free text passed through to the report" {...register("custom")} />
          </Field>

          {/* `referrer` is set by upstream from the HTTP_REFERER header,
              not a visible input — omitted to keep parity with upstream
              `web/submission/index.html`. */}

          <div className="md:col-span-2">
            <Field label="Options (raw, comma-separated key=val)">
              <Input
                placeholder="bp0=ep,base-on-api=NtReadFile,..."
                {...register("options")}
              />
            </Field>
          </div>

          {linuxOnGui && (
            <div className="md:col-span-2">
              <Field label="Linux options (lin_options) — separate from `options`">
                <Input
                  placeholder="filename=foo,timeout=120,..."
                  {...register("lin_options")}
                />
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

        {/* Upstream's web/submission/index.html doesn't render `unique`,
            `tor` or `mitmdump` checkboxes — those POST flags are wired
            into options/route dropdowns. Removed here for visual parity. */}
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
