import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Upload as UploadIcon, Globe } from "lucide-react";

import { PageHead } from "@/components/shared/PageHead";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useMachines } from "@/hooks/useMachines";
import { submitFile, submitUrl, type SubmitFileResponse } from "@/lib/api/tasks";

const advancedSchema = z.object({
  package: z.string().optional(),
  timeout: z.coerce.number().int().min(0).optional(),
  priority: z.coerce.number().int().min(1).max(5).default(1),
  options: z.string().optional(),
  machine: z.string().optional(),
  platform: z.string().optional(),
  tags: z.string().optional(),
  tags_tasks: z.string().optional(),
  custom: z.string().optional(),
  clock: z.string().optional(),
  memory: z.boolean().default(false),
  enforce_timeout: z.boolean().default(false),
  unique: z.boolean().default(false),
  referrer: z.string().url().optional().or(z.literal("")),
  tlp: z.string().optional(),
  route: z.string().optional(),
  cape: z.string().optional(),
  static: z.boolean().default(false),
});

const fileSchema = z.object({
  files: z.custom<FileList>(
    (v) => v instanceof FileList && v.length > 0,
    "Select at least one file",
  ),
  pcap: z.boolean().default(false),
  ...advancedSchema.shape,
});

type FileFields = z.infer<typeof fileSchema>;

const urlSchema = z.object({
  url: z.string().url("Enter a valid URL"),
  ...advancedSchema.shape,
});

type UrlFields = z.infer<typeof urlSchema>;

type Mode = "file" | "url";

export default function SubmitRoute() {
  const [mode, setMode] = useState<Mode>("file");

  return (
    <>
      <PageHead crumbs={["CAPE", "Submit"]} />
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-3xl">
          <div className="mb-3 flex gap-2">
            <Button
              variant={mode === "file" ? "default" : "secondary"}
              onClick={() => setMode("file")}
            >
              <UploadIcon size={14} />
              File
            </Button>
            <Button
              variant={mode === "url" ? "default" : "secondary"}
              onClick={() => setMode("url")}
            >
              <Globe size={14} />
              URL
            </Button>
          </div>
          {mode === "file" ? <FileSubmitForm /> : <UrlSubmitForm />}
        </div>
      </div>
    </>
  );
}

function FileSubmitForm() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FileFields>({
    resolver: zodResolver(fileSchema),
    defaultValues: {
      priority: 1,
      memory: false,
      enforce_timeout: false,
      unique: false,
      static: false,
      pcap: false,
    },
  });

  const mutation = useMutation({
    mutationFn: (form: FormData) => submitFile(form),
    onSuccess: (resp) => navigate(`/tasks/${resp.task_ids[0]}`),
    onError: (err: Error) => setError(err.message),
  });

  function onSubmit(values: FileFields) {
    setError(null);
    const form = new FormData();
    Array.from(values.files).forEach((f) => form.append("file", f));
    if (values.pcap) form.set("pcap", "1");
    for (const [k, v] of Object.entries(values)) {
      if (k === "files" || k === "pcap" || v === undefined || v === "" || v === false) continue;
      form.set(k, typeof v === "boolean" ? "1" : String(v));
    }
    mutation.mutate(form);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>Sample</CardTitle>
          <CardDescription>
            Upload one or more files. PCAP and static-only modes are toggles below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="files">Files</Label>
            <Input id="files" type="file" multiple {...register("files")} />
            {errors.files && (
              <p className="mt-1 text-[11px] text-[var(--color-sev-crit)]">
                {errors.files.message as string}
              </p>
            )}
          </div>
          <ToggleRow control={control} name="pcap" label="Treat as PCAP / SAZ" />
          <ToggleRow control={control} name="static" label="Static-only analysis (no VM)" />
        </CardContent>
      </Card>

      <AdvancedOptions control={control} register={register} />

      {error && (
        <Alert variant="destructive">
          <AlertTriangle size={14} />
          <AlertTitle>Submission failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" variant="default" disabled={isSubmitting || mutation.isPending}>
        {mutation.isPending ? <Spinner size={12} /> : <UploadIcon size={14} />}
        Submit
      </Button>
    </form>
  );
}

function UrlSubmitForm() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UrlFields>({
    resolver: zodResolver(urlSchema),
    defaultValues: {
      priority: 1,
      memory: false,
      enforce_timeout: false,
      unique: false,
      static: false,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: UrlFields): Promise<SubmitFileResponse> =>
      submitUrl({
        url: data.url,
        package: data.package,
        timeout: data.timeout,
        priority: data.priority,
        options: data.options,
        machine: data.machine,
        platform: data.platform,
        tags: data.tags,
        custom: data.custom,
        clock: data.clock,
        memory: data.memory,
        enforce_timeout: data.enforce_timeout,
        referrer: data.referrer || undefined,
        tlp: data.tlp,
        tags_tasks: data.tags_tasks,
        route: data.route,
      }),
    onSuccess: (resp) => navigate(`/tasks/${resp.task_ids[0]}`),
    onError: (err: Error) => setError(err.message),
  });

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>Target URL</CardTitle>
          <CardDescription>
            CAPE will fetch the URL inside the VM with the configured browser package.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Label htmlFor="url">URL</Label>
          <Input id="url" type="url" placeholder="https://example.com/path" {...register("url")} />
          {errors.url && (
            <p className="mt-1 text-[11px] text-[var(--color-sev-crit)]">{errors.url.message}</p>
          )}
        </CardContent>
      </Card>

      <AdvancedOptions control={control} register={register} />

      {error && (
        <Alert variant="destructive">
          <AlertTriangle size={14} />
          <AlertTitle>Submission failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" variant="default" disabled={isSubmitting || mutation.isPending}>
        {mutation.isPending ? <Spinner size={12} /> : <UploadIcon size={14} />}
        Submit
      </Button>
    </form>
  );
}

interface AdvancedOptionsProps {
  control: any;
  register: any;
}

function AdvancedOptions({ control, register }: AdvancedOptionsProps) {
  const machinesQuery = useMachines();
  const machines = machinesQuery.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Advanced options</CardTitle>
        <CardDescription>
          The 18 shared submission parameters (PRD §A.1). Leave blank to inherit defaults.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Package">
            <Input placeholder="exe, dll, doc, pdf, ie..." {...register("package")} />
          </Field>
          <Field label="Timeout (s)">
            <Input type="number" min={0} placeholder="120" {...register("timeout")} />
          </Field>
          <Field label="Priority">
            <Input type="number" min={1} max={5} {...register("priority")} />
          </Field>
          <Field label="Machine">
            <Controller
              control={control}
              name="machine"
              render={({ field }) => {
                // Radix Select forbids "" as an item value (reserved for
                // "clear"); translate to a sentinel and back.
                const ANY = "__any__";
                const value = field.value && field.value !== "" ? field.value : ANY;
                return (
                  <Select
                    value={value}
                    onValueChange={(v) => field.onChange(v === ANY ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="(any available)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>(any available)</SelectItem>
                      <SelectItem value="all">all machines</SelectItem>
                      {machines.map((m) => (
                        <SelectItem key={m.label} value={m.label}>
                          {m.label} {m.platform ? `· ${m.platform}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              }}
            />
          </Field>
          <Field label="Platform">
            <Input placeholder="windows / linux" {...register("platform")} />
          </Field>
          <Field label="Route">
            <Input
              placeholder="none / internet / inetsim / tor / vpn:<name>"
              {...register("route")}
            />
          </Field>
          <Field label="Tags (sample)">
            <Input placeholder="comma-separated" {...register("tags")} />
          </Field>
          <Field label="Tags (task)">
            <Input placeholder="comma-separated" {...register("tags_tasks")} />
          </Field>
          <Field label="TLP">
            <Input placeholder="white / green / amber / red" {...register("tlp")} />
          </Field>
          <Field label="Clock">
            <Input placeholder="MM-DD-YYYY HH:MM:SS" {...register("clock")} />
          </Field>
          <Field label="Custom">
            <Input placeholder="free text" {...register("custom")} />
          </Field>
          <Field label="Referrer">
            <Input placeholder="https://..." {...register("referrer")} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Options (CAPE comma-separated)">
              <Input placeholder="procdump=1,human=1,unpacker=2" {...register("options")} />
            </Field>
          </div>
          <ToggleRow control={control} name="memory" label="Take guest memory dump" />
          <ToggleRow control={control} name="enforce_timeout" label="Enforce timeout" />
          <ToggleRow control={control} name="unique" label="Reject if sample already exists" />
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

interface ToggleRowProps {
  control: any;
  name: string;
  label: string;
}

function ToggleRow({ control, name, label }: ToggleRowProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="flex items-center gap-2">
          <Switch checked={!!field.value} onCheckedChange={field.onChange} />
          <span className="text-xs" style={{ color: "var(--color-fg-1)" }}>
            {label}
          </span>
        </div>
      )}
    />
  );
}
