import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bolt,
  CloudDownload,
  FileCode,
  Files,
  Globe,
  Network,
  Upload,
} from "lucide-react";

import { PageHead } from "@/components/shared/PageHead";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { AdvancedOptionsCard } from "@/components/submit/AdvancedOptionsCard";
import { CapeTogglesCard } from "@/components/submit/CapeTogglesCard";
import {
  SUBMIT_DEFAULTS,
  type SubmitFormValues,
  type SubmitMode,
} from "@/components/submit/form-types";

import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useMachines } from "@/hooks/useMachines";
import {
  submitDlnexec,
  submitDownloadServices,
  submitFile,
  submitUrl,
  type SubmitResponse,
} from "@/lib/api/tasks";
import { buildOptionsString, type CapeToggles } from "@/lib/cape-options";
import { cn } from "@/lib/utils";

interface TabDef {
  key: SubmitMode;
  label: string;
  icon: React.ReactNode;
  flag?: string;
  hint: string;
}

const TABS: TabDef[] = [
  {
    key: "file",
    label: "File(s)",
    icon: <Files size={14} />,
    flag: "filecreate",
    hint: "Upload one or more samples for analysis",
  },
  {
    key: "downloading_service",
    label: "Download",
    icon: <CloudDownload size={14} />,
    flag: "downloading_services",
    hint: "Pull from VirusTotal / MalwareBazaar by hash",
  },
  {
    key: "url",
    label: "URL",
    icon: <Globe size={14} />,
    flag: "urlcreate",
    hint: "Open URL inside the VM browser",
  },
  {
    key: "dlnexec",
    label: "DL & Exec",
    icon: <Bolt size={14} />,
    flag: "dlnexeccreate",
    hint: "Host fetches the URL, then runs it as a sample",
  },
  {
    key: "pcap",
    label: "PCAP",
    icon: <Network size={14} />,
    flag: "filecreate",
    hint: "Re-process a capture (no VM analysis)",
  },
  {
    key: "static",
    label: "Static",
    icon: <FileCode size={14} />,
    flag: "staticextraction",
    hint: "Static-only analysis, skip the VM",
  },
];

export default function SubmitRoute() {
  const navigate = useNavigate();
  const flagsQuery = useFeatureFlags();
  const flags = flagsQuery.data;

  const visibleTabs = useMemo(
    () => TABS.filter((t) => !t.flag || (flags?.[t.flag] ?? true)),
    [flags],
  );
  const [mode, setMode] = useState<SubmitMode>(visibleTabs[0]?.key ?? "file");
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<SubmitFormValues>({ defaultValues: SUBMIT_DEFAULTS });

  const machinesQuery = useMachines();
  const machines = machinesQuery.data ?? [];

  const mutation = useMutation<SubmitResponse, Error, SubmitFormValues>({
    mutationFn: async (values) => {
      const optionsString = buildOptionsString(values.options ?? "", values as CapeToggles);

      if (mode === "url") {
        return submitUrl({
          url: values.url ?? "",
          package: values.package,
          timeout: values.timeout,
          priority: values.priority,
          options: optionsString,
          machine: values.machine,
          platform: values.platform,
          tags: values.tags,
          custom: values.custom,
          memory: values.memory,
          enforce_timeout: values.enforce_timeout,
          clock: values.clock,
          referrer: values.referrer,
          tlp: values.tlp,
          tags_tasks: values.tags_tasks,
          route: values.route,
        });
      }

      if (mode === "dlnexec") {
        return submitDlnexec({
          dlnexec: values.dlnexec ?? "",
          package: values.package,
          timeout: values.timeout,
          priority: values.priority,
          options: optionsString,
          machine: values.machine,
          platform: values.platform,
          tags: values.tags,
          custom: values.custom,
          memory: values.memory,
          enforce_timeout: values.enforce_timeout,
          clock: values.clock,
          tlp: values.tlp,
          tags_tasks: values.tags_tasks,
          route: values.route,
        });
      }

      if (mode === "downloading_service") {
        return submitDownloadServices({
          hashes: values.hashes ?? "",
          options: optionsString,
          custom: values.custom,
          machine: values.machine,
        });
      }

      // file / pcap / static — multipart
      const form = new FormData();
      const files = values.files;
      if (!files || files.length === 0) throw new Error("Select at least one file.");
      for (const f of Array.from(files)) form.append("file", f);
      if (mode === "pcap") form.set("pcap", "1");
      if (mode === "static") form.set("static", "1");

      const stringFields: Array<keyof SubmitFormValues> = [
        "package",
        "timeout",
        "priority",
        "machine",
        "platform",
        "tags",
        "tags_tasks",
        "custom",
        "clock",
        "referrer",
        "tlp",
        "route",
      ];
      for (const k of stringFields) {
        const v = values[k];
        if (v !== undefined && v !== "" && v !== null) form.set(k, String(v));
      }
      if (optionsString) form.set("options", optionsString);
      if (values.memory) form.set("memory", "1");
      if (values.enforce_timeout) form.set("enforce_timeout", "1");
      if (values.unique) form.set("unique", "1");

      if (values.pre_script && values.pre_script[0]) form.append("pre_script", values.pre_script[0]);
      if (values.during_script && values.during_script[0])
        form.append("during_script", values.during_script[0]);

      return submitFile(form);
    },
    onSuccess: (resp) => {
      reset(SUBMIT_DEFAULTS);
      if (resp.task_ids.length > 0) navigate(`/tasks/${resp.task_ids[0]}`);
    },
    onError: (err) => setError(err.message),
  });

  function onSubmit(values: SubmitFormValues) {
    setError(null);
    mutation.mutate(values);
  }

  return (
    <>
      <PageHead crumbs={["CAPE", "Submit"]} />
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-4xl">
          <ModeTabs value={mode} onChange={setMode} tabs={visibleTabs} />

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <PrimaryInputCard mode={mode} register={register} />

            <AdvancedOptionsCard
              control={control}
              register={register}
              machines={machines}
              showReferrer={mode === "url" || mode === "dlnexec"}
              showPreScripts={mode === "file"}
            />

            <CapeTogglesCard control={control} />

            {error && (
              <Alert variant="destructive">
                <AlertTriangle size={14} />
                <AlertTitle>Submission failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => reset(SUBMIT_DEFAULTS)}>
                Reset
              </Button>
              <Button
                type="submit"
                variant="default"
                disabled={isSubmitting || mutation.isPending}
              >
                {mutation.isPending ? <Spinner size={12} /> : <Upload size={14} />}
                Submit
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

interface ModeTabsProps {
  value: SubmitMode;
  onChange: (v: SubmitMode) => void;
  tabs: TabDef[];
}

function ModeTabs({ value, onChange, tabs }: ModeTabsProps) {
  return (
    <div className="mb-3">
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => {
          const active = t.key === value;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "text-[var(--color-fg-0)]"
                  : "text-[var(--color-fg-1)] hover:text-[var(--color-fg-0)]",
              )}
              style={{
                borderColor: active ? "var(--color-accent)" : "var(--color-border)",
                background: active ? "var(--color-accent-soft)" : "var(--color-bg-1)",
              }}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px]" style={{ color: "var(--color-fg-2)" }}>
        {tabs.find((t) => t.key === value)?.hint}
      </p>
    </div>
  );
}

interface PrimaryInputCardProps {
  mode: SubmitMode;
  register: ReturnType<typeof useForm<SubmitFormValues>>["register"];
}

function PrimaryInputCard({ mode, register }: PrimaryInputCardProps) {
  switch (mode) {
    case "file":
      return (
        <Card>
          <CardHeader>
            <CardTitle>File(s)</CardTitle>
            <CardDescription>
              Multiple files supported. Each becomes a separate task.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="files">Sample files</Label>
            <Input id="files" type="file" multiple required {...register("files")} />
          </CardContent>
        </Card>
      );
    case "pcap":
      return (
        <Card>
          <CardHeader>
            <CardTitle>PCAP file(s)</CardTitle>
            <CardDescription>
              Network captures. SAZ files are auto-converted to PCAP.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="pcap-files">PCAP / SAZ files</Label>
            <Input id="pcap-files" type="file" multiple required {...register("files")} />
          </CardContent>
        </Card>
      );
    case "static":
      return (
        <Card>
          <CardHeader>
            <CardTitle>Static analysis</CardTitle>
            <CardDescription>
              Run static extractors only — no VM allocated. Useful for quick PE / Office / config triage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="static-files">Files</Label>
            <Input id="static-files" type="file" multiple required {...register("files")} />
          </CardContent>
        </Card>
      );
    case "url":
      return (
        <Card>
          <CardHeader>
            <CardTitle>URL</CardTitle>
            <CardDescription>
              Open the URL inside the VM with the configured browser package.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              type="url"
              placeholder="https://example.com/path"
              required
              {...register("url")}
            />
          </CardContent>
        </Card>
      );
    case "dlnexec":
      return (
        <Card>
          <CardHeader>
            <CardTitle>DL &amp; Exec</CardTitle>
            <CardDescription>
              Host downloads the URL, then submits the resulting file as a normal sample.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="dlnexec">URL pointing at the binary</Label>
            <Input
              id="dlnexec"
              type="url"
              placeholder="https://malware.example/sample.exe"
              required
              {...register("dlnexec")}
            />
          </CardContent>
        </Card>
      );
    case "downloading_service":
      return (
        <Card>
          <CardHeader>
            <CardTitle>Download from threat-intel service</CardTitle>
            <CardDescription>
              Pull samples from VirusTotal / MalwareBazaar / etc. by hash. Configure providers
              under <code>[downloading_services]</code> in <code>api.conf</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="hashes">Hashes</Label>
            <Input
              id="hashes"
              type="text"
              placeholder="md5/sha1/sha256, comma-separated"
              required
              {...register("hashes")}
            />
            <p className="mt-1.5 text-[11px]" style={{ color: "var(--color-fg-2)" }}>
              Tip: pass <code>options=apikey=&lt;vt_api_key&gt;</code> below to override the
              configured VT key.
            </p>
          </CardContent>
        </Card>
      );
  }
}
