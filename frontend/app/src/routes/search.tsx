import { useState, useMemo, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search as SearchIcon, ChevronDown, ChevronUp, Info, AlertTriangle } from "lucide-react";

import { PageHead } from "@/components/shared/PageHead";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusPill } from "@/components/recent/StatusPill";
import { useSearch, useSearchPrefixes } from "@/hooks/useSearch";

/**
 * Search — mirrors upstream `web/templates/analysis/search.html`.
 *
 *   - Centered search input + button
 *   - Collapsible help block listing every supported prefix, grouped
 *     into 4 categories (matches upstream's `<table>` taxonomy)
 *   - On submit, runs the same `perform_search()` flow via /api/v3/search/
 *     (with /_upstream/analysis/search/ HTML scrape fallback) and renders
 *     the hits as a TaskTable mirroring upstream's columns.
 */
export default function SearchRoute() {
  const [params, setParams] = useSearchParams();
  const initialTerm = params.get("search") ?? "";
  const [draft, setDraft] = useState(initialTerm);
  const [showHelp, setShowHelp] = useState(false);

  const submittedTerm = (params.get("search") ?? "").trim();
  const search = useSearch(submittedTerm);
  const prefixes = useSearchPrefixes();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = new URLSearchParams(params);
    const v = draft.trim();
    if (v) next.set("search", v);
    else next.delete("search");
    setParams(next, { replace: false });
  }

  const grouped = useMemo(() => {
    const groups = new Map<string, { prefix: string; description: string }[]>();
    for (const p of prefixes.data ?? []) {
      const arr = groups.get(p.group) ?? [];
      arr.push({ prefix: p.prefix, description: p.description });
      groups.set(p.group, arr);
    }
    return [...groups.entries()];
  }, [prefixes.data]);

  return (
    <>
      <PageHead crumbs={["CAPE", "Search"]} />

      <div className="scroll" style={{ flex: 1 }}>
        <div style={{ padding: 14 }}>
          {/* Search form */}
          <div className="panel" style={{ marginBottom: 14 }}>
            <div style={{ padding: 18 }}>
              <form
                onSubmit={onSubmit}
                style={{
                  display: "flex",
                  gap: 8,
                  maxWidth: 720,
                  margin: "0 auto",
                }}
              >
                <input
                  id="form_search"
                  name="search"
                  type="text"
                  className="mono"
                  placeholder="Search term (exact match by default)…"
                  aria-label="Search"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  autoFocus
                  style={{
                    flex: 1,
                    height: 36,
                    padding: "0 12px",
                    background: "var(--color-bg-2)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-fg-0)",
                    borderRadius: 3,
                    fontFamily: "var(--font-mono)",
                    fontSize: 12.5,
                    outline: "none",
                  }}
                />
                <button
                  type="submit"
                  className="btn primary"
                  style={{ height: 36, padding: "0 18px" }}
                >
                  <SearchIcon size={14} />
                  <span>Search</span>
                </button>
              </form>

              <div style={{ textAlign: "center", marginTop: 12 }} className="dim">
                <button
                  type="button"
                  onClick={() => setShowHelp((v) => !v)}
                  className="btn ghost"
                  aria-expanded={showHelp}
                  style={{
                    color: "var(--color-accent)",
                    height: 24,
                    padding: "0 8px",
                  }}
                >
                  <Info size={12} />
                  <span style={{ fontSize: 12 }}>Need help? Click here for search syntax</span>
                  {showHelp ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              </div>
            </div>
          </div>

          {/* Help collapse */}
          {showHelp && (
            <div className="panel" style={{ marginBottom: 14 }}>
              <div className="panel-h">
                <Info size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
                Search Help
              </div>
              <div style={{ padding: 14 }}>
                <p
                  className="dim"
                  style={{ fontSize: 12, lineHeight: 1.6, marginTop: 0, marginBottom: 6 }}
                >
                  ElasticSearch queries do not use a prefix. e.g.,{" "}
                  <code className="mono" style={{ color: "var(--color-accent)" }}>
                    *windows.*
                  </code>{" "}
                  matches 'time.windows.com'.
                </p>
                <p
                  className="dim"
                  style={{ fontSize: 12, lineHeight: 1.6, marginTop: 0, marginBottom: 6 }}
                >
                  For MD5, SHA1, SHA256, etc., no prefix is needed (matches{" "}
                  <b style={{ color: "var(--color-fg-0)" }}>any</b> file generated by analysis,
                  including dropped/extracted files).
                </p>
                <p
                  className="dim"
                  style={{ fontSize: 12, lineHeight: 1.6, marginTop: 0, marginBottom: 6 }}
                >
                  To search for the{" "}
                  <b style={{ color: "var(--color-fg-0)" }}>initial submitted file</b> specifically,
                  use{" "}
                  <code className="mono" style={{ color: "var(--color-accent)" }}>
                    target_sha256:
                  </code>{" "}
                  prefix.
                </p>
                <p
                  className="dim"
                  style={{ fontSize: 12, lineHeight: 1.6, marginTop: 0, marginBottom: 14 }}
                >
                  By default, searches are exact matches. Use regex characters (e.g.,{" "}
                  <code className="mono" style={{ color: "var(--color-accent)" }}>
                    ^ $ | ? * + ( ) [ ] {"{"} {"}"}
                  </code>
                  ) to force a regex search.
                </p>

                <table className="data" id="search-prefixes-table">
                  <thead>
                    <tr>
                      <th style={{ width: 220, textAlign: "center" }}>Prefix</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.map(([groupName, items]) => (
                      <FragmentGroup key={groupName} title={groupName} items={items} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Result echo */}
          {submittedTerm && (
            <div
              style={{
                textAlign: "center",
                marginBottom: 12,
                color: "var(--color-fg-2)",
                fontSize: 14,
              }}
            >
              Results for term:{" "}
              <span style={{ color: "var(--color-sev-crit)", fontWeight: 600 }} className="mono">
                {submittedTerm}
              </span>
            </div>
          )}

          {/* Loading */}
          {search.isFetching && submittedTerm && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                padding: 24,
                gap: 8,
                color: "var(--color-fg-2)",
              }}
            >
              <Spinner size={14} />
              <span>Searching…</span>
            </div>
          )}

          {/* Error */}
          {(search.data?.error || search.isError) && submittedTerm && !search.isFetching && (
            <Alert variant="destructive" style={{ marginBottom: 14 }}>
              <AlertTriangle size={14} />
              <AlertTitle>Search failed</AlertTitle>
              <AlertDescription>
                {search.data?.error ?? (search.error as Error)?.message}
              </AlertDescription>
            </Alert>
          )}

          {/* Results */}
          {search.data?.ok && search.data.items.length > 0 && (
            <div className="panel">
              <div className="panel-h">
                <SearchIcon size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
                Search Results
                <span className="count">
                  · {search.data.items.length} item{search.data.items.length === 1 ? "" : "s"}
                </span>
              </div>
              <table className="data" style={{ tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>ID</th>
                    <th style={{ width: 130 }}>Timestamp</th>
                    <th style={{ width: 80 }}>Package</th>
                    <th>Filename</th>
                    <th style={{ width: 200 }}>Target</th>
                    <th style={{ width: 110 }}>Detections</th>
                    <th style={{ width: 110 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {search.data.items.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <Link
                          to={`/tasks/${t.id}`}
                          style={{
                            color: "var(--color-accent)",
                            textDecoration: "none",
                            fontWeight: 600,
                          }}
                        >
                          #{t.id}
                        </Link>
                      </td>
                      <td className="dim">{formatTs(t.submitted)}</td>
                      <td>
                        {t.package ? (
                          <span className="tag">{t.package}</span>
                        ) : (
                          <span className="dim">—</span>
                        )}
                      </td>
                      <td
                        className="text-truncate"
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: "var(--color-fg-0)",
                        }}
                        title={t.target}
                      >
                        <Link
                          to={`/tasks/${t.id}`}
                          style={{ color: "inherit", textDecoration: "none" }}
                        >
                          {basename(t.target) || "—"}
                        </Link>
                      </td>
                      <td
                        className="mono"
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontSize: 11,
                        }}
                        title={t.md5 || t.target}
                      >
                        {t.md5 || t.target || "—"}
                      </td>
                      <td>
                        {t.family ? (
                          <span className="tag crit">{t.family}</span>
                        ) : (
                          <span className="dim">—</span>
                        )}
                      </td>
                      <td>
                        <StatusPill status={t.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* No results */}
          {search.data?.ok &&
            search.data.items.length === 0 &&
            submittedTerm &&
            !search.isFetching &&
            !search.data.error && (
              <div
                className="panel"
                style={{
                  padding: "60px 20px",
                  textAlign: "center",
                  color: "var(--color-fg-2)",
                }}
              >
                <SearchIcon size={36} style={{ color: "var(--color-fg-3)", marginBottom: 10 }} />
                <p style={{ margin: 0, fontSize: 14 }}>
                  No tasks matched <span className="mono">{submittedTerm}</span>.
                </p>
              </div>
            )}
        </div>
      </div>
    </>
  );
}

interface FragmentGroupProps {
  title: string;
  items: { prefix: string; description: string }[];
}

function FragmentGroup({ title, items }: FragmentGroupProps) {
  return (
    <>
      <tr>
        <th
          colSpan={2}
          style={{
            textAlign: "center",
            color: "var(--color-fg-0)",
            background: "var(--color-bg-3)",
            textTransform: "none",
            letterSpacing: "0.04em",
          }}
        >
          {title}
        </th>
      </tr>
      {items.map((p) => (
        <tr key={p.prefix}>
          <td style={{ textAlign: "center" }}>
            <code className="mono" style={{ color: "var(--color-accent)", fontSize: 11.5 }}>
              {p.prefix}:
            </code>
          </td>
          <td
            style={{ color: "var(--color-fg-1)", whiteSpace: "normal" }}
            dangerouslySetInnerHTML={{ __html: highlightInline(p.description) }}
          />
        </tr>
      ))}
    </>
  );
}

function highlightInline(s: string): string {
  // Highlight inline `code` snippets (matches upstream's <code> markers).
  return s.replace(
    /<code>([^<]+)<\/code>|`([^`]+)`/g,
    (_m, a, b) => `<code class="mono" style="color: var(--color-accent)">${a ?? b}</code>`,
  );
}

function basename(p: string): string {
  if (!p) return "";
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx >= 0 ? p.slice(idx + 1) : p;
}

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 19).replace("T", " ");
}
