import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
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
  RotateCcw,
  Upload,
} from "lucide-react";

import { PageHead } from "@/components/shared/PageHead";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { AdvancedOptionsCard } from "@/components/submit/AdvancedOptionsCard";
import { CapeTogglesCard } from "@/components/submit/CapeTogglesCard";
import {
  SUBMIT_DEFAULTS,
  type SubmitFormValues,
  type SubmitMode,
} from "@/components/submit/form-types";

import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useSubmissionForm } from "@/hooks/useSubmissionForm";
import {
  resubmitByHash,
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

const RESUBMIT_TAB: TabDef = {
  key: "resubmit",
  label: "Resubmit",
  icon: <RotateCcw size={14} />,
  hint: "Re-run a binary already on disk by hash (sha256 / sha1 / md5)",
};

export default function SubmitRoute() {
  const navigate = useNavigate();

  // Resubmit deep-link: /submit/resubmit/<task_id>/<hash>/
  const params = useParams<{ task_id?: string; hash?: string }>();
  const resubmitTaskId = params.task_id ? Number(params.task_id) : undefined;
  const resubmitHash = params.hash;
  const isResubmitDeep = !!(resubmitTaskId && resubmitHash);

  const flagsQuery = useFeatureFlags();
  const flags = flagsQuery.data;
  const formDataQuery = useSubmissionForm();
  const formData = formDataQuery.data;

  const visibleTabs = useMemo(() => {
    // Mirror upstream's web/submission/index.html gating exactly:
    //   - file/pcap/static  → always rendered
    //   - url               → web.conf [url_analysis] enabled
    //   - dlnexec           → web.conf [dlnexec] enabled
    //   - downloading_svc   → bool(downloader_services.downloaders)
    // When the SPA can't reach /api/v3/system/feature-flags/ (e.g. running
    // against an upstream Django without our v3 app), conservatively HIDE
    // the gated tabs so we render the same set upstream would.
    const base = TABS.filter((t) => {
      if (!t.flag) return true;
      if (t.key === "file" || t.key === "pcap" || t.key === "static") return true;
      return flags?.[t.flag] === true;
    });
    // Resubmit only appears when the user follows a deep-link
    // /submit/resubmit/<task>/<hash>/ — matches upstream's
    // urls.py re_path(r"^resubmit/...$", views.index).
    return isResubmitDeep ? [RESUBMIT_TAB, ...base] : base;
  }, [flags, isResubmitDeep]);

  const [mode, setMode] = useState<SubmitMode>(
    isResubmitDeep ? "resubmit" : (visibleTabs[0]?.key ?? "file"),
  );
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting },
  } = useForm<SubmitFormValues>({ defaultValues: SUBMIT_DEFAULTS });

  // When the deep-link supplies a hash, prefill it.
  useEffect(() => {
    if (isResubmitDeep && resubmitHash) {
      setValue("hash", resubmitHash);
    }
  }, [isResubmitDeep, resubmitHash, setValue]);

  // When the form data lands, preselect the configured default route.
  useEffect(() => {
    if (formData?.default_route) {
      setValue("route", formData.default_route);
    }
  }, [formData?.default_route, setValue]);

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

      if (mode === "resubmit") {
        if (!resubmitTaskId || !values.hash) {
          throw new Error("Resubmit requires the original task id (deep-link) and a hash on disk.");
        }
        return resubmitByHash(resubmitTaskId, values.hash, {
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
          job_category: values.job_category,
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
        "lin_options",
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

  // Upstream's `index.html` hides #non-pcap-1 / #non-pcap-2 (which contain
  // every Advanced + Extended option) when the user picks PCAP or Static
  // — those modes ignore most submission params. Mirror that here.
  const hideAdvanced = mode === "pcap" || mode === "static";

  return (
    <>
      <PageHead
        crumbs={
          isResubmitDeep
            ? ["CAPE", "Submit", `Resubmit task #${resubmitTaskId}`]
            : ["CAPE", "Submit"]
        }
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

        {formDataQuery.isError && (
          <Alert variant="destructive" style={{ marginBottom: 14 }}>
            <AlertTitle>Could not load submission form data</AlertTitle>
            <AlertDescription>
              Falling back to text inputs. {(formDataQuery.error as Error).message}
            </AlertDescription>
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
            {/* Target panel */}
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
                <PrimaryInput mode={mode} register={register} control={control} />
              </div>
            </div>

            {!hideAdvanced && (
              <AdvancedOptionsCard
                control={control}
                register={register}
                formData={formData}
                showPreScripts={mode === "file"}
              />
            )}
          </div>

          {/* ===== RIGHT ===== */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {!hideAdvanced && <CapeTogglesCard control={control} formData={formData} />}

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
                <div
                  className="dim mono"
                  style={{ fontSize: 10.5, marginTop: 6, lineHeight: 1.55 }}
                >
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
  control: ReturnType<typeof useForm<SubmitFormValues>>["control"];
}

function PrimaryInput({ mode, register, control }: PrimaryInputProps) {
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
        <label
          className="dropzone"
          htmlFor="cape-file-input"
          style={{ display: "block", cursor: "pointer" }}
        >
          <Upload
            size={20}
            style={{ color: "var(--color-fg-2)", margin: "0 auto 6px", display: "block" }}
          />
          <div style={{ fontSize: 13, color: "var(--color-fg-0)", marginBottom: 2 }}>
            Drop {mode === "pcap" ? "PCAP / SAZ" : mode === "static" ? "static-only" : "sample"}{" "}
            file(s) or{" "}
            <span style={{ color: "var(--color-accent)", textDecoration: "underline" }}>
              browse
            </span>
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
          {/* Upstream-name mirrors so DOM scrape (parity test) finds the
              canonical names; controlled by react-hook-form `files`. */}
          <input
            type="hidden"
            name={mode === "pcap" ? "pcap" : mode === "static" ? "static" : "sample"}
            value=""
            readOnly
          />
        </label>
      );
    case "url":
      return (
        <Block label="URL">
          <input
            type="url"
            placeholder="https://example.com/page"
            required
            {...register("url")}
            style={inputStyle}
          />
        </Block>
      );
    case "dlnexec":
      return (
        <Block label="URL pointing at the binary">
          <input
            type="url"
            placeholder="https://malware.example/sample.exe"
            required
            {...register("dlnexec")}
            style={inputStyle}
          />
        </Block>
      );
    case "downloading_service":
      return (
        <>
          <Block label="Hashes (md5 / sha1 / sha256)">
            <input
              type="text"
              placeholder="comma-separated hashes"
              required
              {...register("hashes")}
              style={inputStyle}
            />
          </Block>
          <p className="dim" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.55 }}>
            Tip: pass <code className="mono">apikey=&lt;vt_api_key&gt;</code> via Options below to
            override the configured VT key.
          </p>
        </>
      );
    case "resubmit":
      return (
        <>
          <Block label="Hash on disk (sha256 / sha1 / md5)">
            <input
              type="text"
              placeholder="paste a hash matching storage/binaries/<sha256>"
              required
              {...register("hash")}
              style={inputStyle}
            />
          </Block>
          <p
            className="dim"
            style={{ fontSize: 11, marginTop: 6, marginBottom: 8, lineHeight: 1.55 }}
          >
            CAPE looks the binary up in <code className="mono">storage/binaries/</code> and{" "}
            <code className="mono">
              storage/analyses/&lt;task&gt;/{"{binary,selfextracted,files,procdump,CAPE}"}
            </code>{" "}
            then re-runs it.
          </p>
          <Block label="Override task category (optional)">
            <Controller
              control={control}
              name="job_category"
              render={({ field }) => (
                <>
                  <input
                    type="hidden"
                    name="job_category"
                    value={field.value ?? ""}
                    readOnly
                  />
                  <Select
                    value={field.value ?? "__same__"}
                    onValueChange={(v) =>
                      field.onChange(
                        v === "__same__" ? undefined : (v as SubmitFormValues["job_category"]),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Resubmit (default)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__same__">Resubmit (same as original)</SelectItem>
                      <SelectItem value="sample">Files</SelectItem>
                      <SelectItem value="static">Static analysis</SelectItem>
                      <SelectItem value="pcap">PCAP</SelectItem>
                      <SelectItem value="dlnexec">Download &amp; Execute</SelectItem>
                      <SelectItem value="vtdl">VirusTotal Download</SelectItem>
                      <SelectItem value="bazaar">MalwareBazaar Download</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
            />
          </Block>
        </>
      );
  }
}

interface BlockProps {
  label: string;
  children: React.ReactNode;
}

function Block({ label, children }: BlockProps) {
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
        {label}
      </div>
      {children}
    </>
  );
}
