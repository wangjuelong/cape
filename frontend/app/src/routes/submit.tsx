import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bolt,
  CloudDownload,
  ExternalLink,
  FileCode,
  Files,
  Globe,
  Network,
  Play,
  Upload,
} from "lucide-react";

import { PageHead } from "@/components/shared/PageHead";
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

      if (values.pre_script && values.pre_script[0])
        form.append("pre_script", values.pre_script[0]);
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

  const isPending = isSubmitting || mutation.isPending;

  return (
    <>
      <PageHead
        crumbs={["CAPE", "Submit"]}
        actions={
          <>
            <a className="btn" href="/apiv3/schema/swagger/" target="_blank" rel="noreferrer">
              <ExternalLink size={14} />
              <span>API docs</span>
            </a>
            <button
              type="button"
              className="btn primary"
              disabled={isPending}
              onClick={handleSubmit(onSubmit)}
            >
              {isPending ? <Spinner size={12} /> : <Play size={14} />}
              <span>Analyze</span>
            </button>
          </>
        }
      />

      <form className="scroll" style={{ padding: 14 }} onSubmit={handleSubmit(onSubmit)}>
        {error && (
          <Alert variant="destructive" style={{ marginBottom: 14 }}>
            <AlertTriangle size={14} />
            <AlertTitle>Submission failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.3fr 1fr",
            gap: 14,
            alignItems: "start",
          }}
        >
          {/* ===== LEFT ===== */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Target panel — segmented mode tabs + primary input */}
            <div className="panel">
              <div className="panel-h">Target</div>
              <div style={{ padding: 14 }}>
                <ModeStrip mode={mode} onChange={setMode} tabs={visibleTabs} />
                <p
                  className="dim"
                  style={{ fontSize: 11.5, marginTop: 4, marginBottom: 14, lineHeight: 1.5 }}
                >
                  {visibleTabs.find((t) => t.key === mode)?.hint}
                </p>
                <PrimaryInput mode={mode} register={register} />
              </div>
            </div>

            <AdvancedOptionsCard
              control={control}
              register={register}
              machines={machines}
              showReferrer={mode === "url" || mode === "dlnexec"}
              showPreScripts={mode === "file"}
            />
          </div>

          {/* ===== RIGHT ===== */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <CapeTogglesCard control={control} />

            <div className="panel">
              <div className="panel-h">Submit</div>
              <div
                style={{
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <button
                  type="submit"
                  className="btn primary"
                  disabled={isPending}
                  style={{ height: 32, justifyContent: "center" }}
                >
                  {isPending ? <Spinner size={12} /> : <Upload size={14} />}
                  <span>Analyze</span>
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => reset(SUBMIT_DEFAULTS)}
                  style={{ height: 28, justifyContent: "center" }}
                >
                  Reset to defaults
                </button>
                <div className="dim mono" style={{ fontSize: 10.5, marginTop: 6, lineHeight: 1.55 }}>
                  Submission goes through the v3 API and lands in the analysis queue. Check{" "}
                  <a className="mono" style={{ color: "var(--color-accent)" }} href="/recent">
                    Recent
                  </a>{" "}
                  for live status updates.
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}

interface ModeStripProps {
  mode: SubmitMode;
  onChange: (m: SubmitMode) => void;
  tabs: TabDef[];
}

function ModeStrip({ mode, onChange, tabs }: ModeStripProps) {
  return (
    <div
      style={{
        display: "flex",
        background: "var(--color-bg-2)",
        border: "1px solid var(--color-border)",
        borderRadius: 3,
        padding: 2,
        gap: 0,
      }}
    >
      {tabs.map((t) => {
        const active = t.key === mode;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            style={{
              flex: 1,
              height: 28,
              border: "none",
              borderRadius: 2,
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              background: active ? "var(--color-bg-3)" : "transparent",
              color: active ? "var(--color-fg-0)" : "var(--color-fg-2)",
              fontSize: 12,
              fontWeight: active ? 600 : 400,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

interface PrimaryInputProps {
  mode: SubmitMode;
  register: ReturnType<typeof useForm<SubmitFormValues>>["register"];
}

function PrimaryInput({ mode, register }: PrimaryInputProps) {
  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 36,
    padding: "0 12px",
    background: "var(--color-bg-2)",
    border: "1px solid var(--color-border)",
    color: "var(--color-fg-0)",
    borderRadius: 3,
    fontFamily: "var(--font-mono)",
    fontSize: 12.5,
    outline: "none",
  };

  switch (mode) {
    case "file":
    case "pcap":
    case "static":
      return (
        <>
          <label className="dropzone" htmlFor="cape-file-input" style={{ display: "block", cursor: "pointer" }}>
            <Upload
              size={20}
              style={{ color: "var(--color-fg-2)", margin: "0 auto 6px", display: "block" }}
            />
            <div style={{ fontSize: 13, color: "var(--color-fg-0)", marginBottom: 2 }}>
              Drop {mode === "pcap" ? "PCAP / SAZ" : mode === "static" ? "static-only" : "sample"} file(s) or{" "}
              <span style={{ color: "var(--color-accent)", textDecoration: "underline" }}>browse</span>
            </div>
            <div className="dim" style={{ fontSize: 11 }}>
              Multiple files supported · each becomes a separate task
            </div>
            <input
              id="cape-file-input"
              type="file"
              multiple
              required
              {...register("files")}
              style={{ display: "none" }}
            />
          </label>
        </>
      );
    case "url":
      return (
        <>
          <div
            className="dim mono"
            style={{
              fontSize: 10.5,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            URL
          </div>
          <input
            type="url"
            placeholder="https://example.com/page"
            required
            {...register("url")}
            style={inputStyle}
          />
        </>
      );
    case "dlnexec":
      return (
        <>
          <div
            className="dim mono"
            style={{
              fontSize: 10.5,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            URL pointing at the binary
          </div>
          <input
            type="url"
            placeholder="https://malware.example/sample.exe"
            required
            {...register("dlnexec")}
            style={inputStyle}
          />
        </>
      );
    case "downloading_service":
      return (
        <>
          <div
            className="dim mono"
            style={{
              fontSize: 10.5,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            Hashes (md5 / sha1 / sha256)
          </div>
          <input
            type="text"
            placeholder="comma-separated hashes"
            required
            {...register("hashes")}
            style={inputStyle}
          />
          <p
            className="dim"
            style={{ fontSize: 11, marginTop: 6, lineHeight: 1.55 }}
          >
            Tip: pass <code className="mono">apikey=&lt;vt_api_key&gt;</code> via Options below to override the
            configured VT key.
          </p>
        </>
      );
  }
}
