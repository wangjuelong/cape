/**
 * "PE Information" card — mirrors upstream `/analysis/<id>/`
 * inline accordion with Version Info / Sections / Imports / Exports /
 * Resources / Overlay / Misc kv. Renders nothing for non-PE samples
 * (URL / PCAP / non-Windows-binary).
 */
import { useState } from "react";

import type { PeInfo } from "@/lib/api/reports";

interface PeInfoPanelProps {
  pe: PeInfo;
}

type SectionKey = "version" | "sections" | "imports" | "exports" | "resources" | "misc";

export function PeInfoPanel({ pe }: PeInfoPanelProps) {
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    version: false,
    sections: true,
    imports: false,
    exports: false,
    resources: false,
    misc: true,
  });
  const toggle = (k: SectionKey) => setOpen((p) => ({ ...p, [k]: !p[k] }));

  const hasVersion = (pe.versioninfo?.length ?? 0) > 0;
  const hasSections = (pe.sections?.length ?? 0) > 0;
  const hasImports = (pe.imports?.length ?? 0) > 0;
  const hasExports = (pe.exports?.length ?? 0) > 0;
  const hasResources = (pe.resources?.length ?? 0) > 0;
  const hasMisc = pe.misc && Object.keys(pe.misc).length > 0;

  if (!hasVersion && !hasSections && !hasImports && !hasExports && !hasResources && !hasMisc) {
    return null;
  }

  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-h">PE Information</div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        {hasVersion && (
          <Accordion
            label={`Version Info · ${pe.versioninfo!.length}`}
            open={open.version}
            onClick={() => toggle("version")}
          >
            <KvList rows={pe.versioninfo!.map((v) => [v.name, v.value])} />
          </Accordion>
        )}

        {hasSections && (
          <Accordion
            label={`Sections · ${pe.sections!.length}`}
            open={open.sections}
            onClick={() => toggle("sections")}
          >
            <Table
              cols={[
                "Name",
                "Raw Addr",
                "Virt Addr",
                "Virt Size",
                "Raw Size",
                "Entropy",
                "Characteristics",
              ]}
              rows={pe.sections!.map((s) => [
                s.name,
                s.raw_address,
                s.virtual_address,
                s.virtual_size,
                s.size_of_data,
                s.entropy,
                s.characteristics,
              ])}
              mono
            />
          </Accordion>
        )}

        {hasImports && (
          <Accordion
            label={`Imports · ${pe.imports!.length} DLLs / ${pe
              .imports!.reduce((acc, i) => acc + i.functions.length, 0)
              .toLocaleString()} fns`}
            open={open.imports}
            onClick={() => toggle("imports")}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 11 }}>
              {pe.imports!.map((imp) => (
                <div key={imp.dll}>
                  <div
                    className="mono"
                    style={{
                      color: "var(--color-fg-1)",
                      fontWeight: 600,
                      fontSize: 11.5,
                      padding: "2px 0",
                    }}
                  >
                    {imp.dll}
                    <span className="dim" style={{ marginLeft: 6, fontWeight: 400 }}>
                      · {imp.functions.length}
                    </span>
                  </div>
                  <Table
                    cols={["Address", "Function"]}
                    rows={imp.functions.map((f) => [f.address, f.name])}
                    mono
                    compact
                  />
                </div>
              ))}
            </div>
          </Accordion>
        )}

        {hasExports && (
          <Accordion
            label={`Exports · ${pe.exports!.length}`}
            open={open.exports}
            onClick={() => toggle("exports")}
          >
            <Table
              cols={["Ordinal", "Address", "Name"]}
              rows={pe.exports!.map((e) => [e.ordinal, e.address, e.name])}
              mono
              compact
            />
          </Accordion>
        )}

        {hasResources && (
          <Accordion
            label={`Resources · ${pe.resources!.length}`}
            open={open.resources}
            onClick={() => toggle("resources")}
          >
            <Table
              cols={["Name", "Offset", "Size", "Type", "Lang", "SubLang", "Entropy"]}
              rows={pe.resources!.map((r) => [
                r.name,
                r.offset,
                r.size,
                r.filetype,
                r.language,
                r.sublanguage,
                r.entropy,
              ])}
              mono
            />
          </Accordion>
        )}

        {hasMisc && (
          <Accordion label="Misc" open={open.misc} onClick={() => toggle("misc")}>
            <KvList rows={Object.entries(pe.misc!)} mono />
          </Accordion>
        )}

        {pe.overlay && (
          <Accordion label="Overlay" open onClick={() => {}}>
            <KvList
              rows={[
                ["offset", pe.overlay.offset],
                ["size", pe.overlay.size],
              ]}
              mono
            />
          </Accordion>
        )}
      </div>
    </div>
  );
}

interface AccordionProps {
  label: string;
  open: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function Accordion({ label, open, onClick, children }: AccordionProps) {
  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onClick}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          background: "var(--color-bg-2)",
          color: "var(--color-fg-1)",
          border: 0,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          textAlign: "left",
        }}
      >
        <span>{label}</span>
        <span className="dim" style={{ fontSize: 10.5 }}>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && <div style={{ padding: 10, background: "var(--color-bg-1)" }}>{children}</div>}
    </div>
  );
}

function KvList({ rows, mono }: { rows: Array<[string, string]>; mono?: boolean }) {
  return (
    <dl
      className={mono ? "kv mono" : "kv"}
      style={{ gridTemplateColumns: "180px 1fr", fontSize: mono ? 11.5 : undefined }}
    >
      {rows.map(([k, v]) => (
        <KvRow key={k} k={k} v={v} />
      ))}
    </dl>
  );
}

function KvRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt>{k}</dt>
      <dd
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={v}
      >
        {v || <span className="dim">—</span>}
      </dd>
    </>
  );
}

interface TableProps {
  cols: string[];
  rows: string[][];
  mono?: boolean;
  compact?: boolean;
}

function Table({ cols, rows, mono, compact }: TableProps) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        className={mono ? "data mono" : "data"}
        style={{ fontSize: mono ? 10.5 : 11.5, width: "100%" }}
      >
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, compact ? 200 : 50).map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td
                  key={j}
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 320,
                  }}
                  title={cell}
                >
                  {cell || <span className="dim">—</span>}
                </td>
              ))}
            </tr>
          ))}
          {rows.length > (compact ? 200 : 50) && (
            <tr>
              <td colSpan={cols.length} className="dim" style={{ textAlign: "center", padding: 6 }}>
                … and {rows.length - (compact ? 200 : 50)} more
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
