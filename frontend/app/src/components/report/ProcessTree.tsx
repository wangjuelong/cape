import { useMemo, useEffect } from "react";
import {
  Background,
  Controls,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";

import "@xyflow/react/dist/base.css";
import type { ProcessSummary } from "@/lib/api/reports";

interface ProcessTreeProps {
  processes: ProcessSummary[];
  selected: number | null;
  onSelect: (pid: number) => void;
}

const NODE_W = 200;
const NODE_H = 56;

function layout(processes: ProcessSummary[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 60, nodesep: 14 });

  for (const p of processes) {
    if (p.pid === null) continue;
    g.setNode(String(p.pid), { width: NODE_W, height: NODE_H });
    if (p.ppid !== null && p.ppid !== undefined && processes.some((q) => q.pid === p.ppid)) {
      g.setEdge(String(p.ppid), String(p.pid));
    }
  }
  dagre.layout(g);

  const nodes: Node[] = processes
    .filter((p) => p.pid !== null)
    .map((p) => {
      const pos = g.node(String(p.pid)) ?? { x: 0, y: 0 };
      return {
        id: String(p.pid),
        position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
        data: { label: <NodeLabel proc={p} /> } as Record<string, unknown>,
        style: {
          width: NODE_W,
          height: NODE_H,
          padding: 0,
          background: "var(--color-bg-2)",
          border: "1px solid var(--color-border)",
          borderRadius: 4,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
    });

  const edges: Edge[] = processes
    .filter(
      (p) =>
        p.ppid !== null &&
        p.ppid !== undefined &&
        processes.some((q) => q.pid === p.ppid) &&
        p.pid !== null,
    )
    .map((p) => ({
      id: `${p.ppid}-${p.pid}`,
      source: String(p.ppid),
      target: String(p.pid),
      style: { stroke: "var(--color-border-strong)" },
    }));

  return { nodes, edges };
}

function NodeLabel({ proc }: { proc: ProcessSummary }) {
  return (
    <div className="flex h-full flex-col justify-center px-3">
      <div className="truncate text-[11px] font-semibold" style={{ color: "var(--color-fg-0)" }}>
        {proc.name || "(unknown)"}
      </div>
      <div className="font-mono text-[10px]" style={{ color: "var(--color-fg-2)" }}>
        pid {proc.pid}
      </div>
    </div>
  );
}

export function ProcessTree(props: ProcessTreeProps) {
  return (
    <ReactFlowProvider>
      <ProcessTreeInner {...props} />
    </ReactFlowProvider>
  );
}

function ProcessTreeInner({ processes, selected, onSelect }: ProcessTreeProps) {
  const computed = useMemo(() => layout(processes), [processes]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(computed.nodes);
  const [edges, , onEdgesChange] = useEdgesState<Edge>(computed.edges);

  useEffect(() => {
    setNodes((existing) =>
      computed.nodes.map((n) => {
        const isSelected = String(selected) === n.id;
        return {
          ...n,
          ...(existing.find((e) => e.id === n.id) ?? {}),
          position: n.position,
          selected: isSelected,
          style: {
            ...n.style,
            background: isSelected ? "var(--color-accent-soft)" : "var(--color-bg-2)",
            border: isSelected ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
          },
        };
      }),
    );
  }, [computed.nodes, selected, setNodes]);

  return (
    <div style={{ height: 220 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_e, n) => onSelect(Number(n.id))}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.4}
        maxZoom={1.5}
      >
        <Background gap={16} color="var(--color-border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
