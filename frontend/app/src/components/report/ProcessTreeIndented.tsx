/**
 * Recursive process tree rendering — mirrors upstream's
 * `analysis/behavior/_tree.html` (Bootstrap card with indented `<ul>` per
 * generation). Each leaf is clickable; clicking jumps to the matching
 * process pill.
 *
 * Mongo `behavior.processtree` shape (recursive):
 *   { pid, name, command_line, children: [...] }
 *
 * Some upstream versions use `commandline` (no underscore) — we handle both.
 */
import type { ReactNode } from "react";

interface ProcessNode {
  pid?: number;
  name?: string;
  process_id?: number;
  process_name?: string;
  command_line?: string;
  commandline?: string;
  children?: ProcessNode[];
}

interface ProcessTreeIndentedProps {
  tree: unknown[];
  detections2pid?: Record<string, string[]>;
  onSelect: (pid: number) => void;
}

export function ProcessTreeIndented({ tree, detections2pid, onSelect }: ProcessTreeIndentedProps) {
  if (!tree || tree.length === 0) {
    return <span className="dim">No process tree.</span>;
  }
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, fontFamily: "var(--font-mono)" }}>
      {(tree as ProcessNode[]).map((p, i) => (
        <Node
          key={`${p.process_id ?? p.pid}-${i}`}
          node={p}
          depth={0}
          detections2pid={detections2pid}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

function Node({
  node,
  depth,
  detections2pid,
  onSelect,
}: {
  node: ProcessNode;
  depth: number;
  detections2pid?: Record<string, string[]>;
  onSelect: (pid: number) => void;
}): ReactNode {
  const pid = node.process_id ?? node.pid;
  const name = node.process_name ?? node.name ?? "(unknown)";
  const cmd = node.command_line ?? node.commandline ?? "";
  const detections = pid !== undefined ? detections2pid?.[String(pid)] ?? [] : [];
  const children = node.children ?? [];

  return (
    <li
      style={{
        marginLeft: depth * 16,
        marginBottom: 2,
        paddingLeft: depth > 0 ? 8 : 0,
        borderLeft:
          depth > 0 ? "1px solid var(--color-border)" : "none",
        fontSize: 11.5,
        lineHeight: 1.6,
      }}
    >
      <span style={{ color: "var(--color-fg-2)", marginRight: 4 }}>▸</span>
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          if (pid !== undefined) onSelect(pid);
        }}
        style={{
          color: "var(--color-fg-0)",
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        {name}
      </a>
      <span className="dim" style={{ marginLeft: 4 }}>
        ({pid})
      </span>
      {cmd && (
        <span
          style={{
            color: "var(--color-fg-1)",
            fontSize: 10.5,
            marginLeft: 8,
            opacity: 0.85,
          }}
        >
          {cmd}
        </span>
      )}
      {detections.length > 0 && (
        <span
          className="tag crit"
          style={{ marginLeft: 6, fontSize: 10 }}
          title={detections.join(", ")}
        >
          {detections.join(", ")}
        </span>
      )}
      {children.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {children.map((c, i) => (
            <Node
              key={`${c.process_id ?? c.pid}-${i}`}
              node={c}
              depth={depth + 1}
              detections2pid={detections2pid}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
