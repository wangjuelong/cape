import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "./ScoreBadge";
import { StatusPill } from "./StatusPill";
import type { TaskSummary } from "@/types/api";

const columns: ColumnDef<TaskSummary>[] = [
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => (
      <Link
        to={`/tasks/${row.original.id}`}
        className="font-mono text-[11px] hover:underline"
        style={{ color: "var(--color-accent)" }}
      >
        #{row.original.id}
      </Link>
    ),
  },
  {
    accessorKey: "score",
    header: "Score",
    cell: ({ row }) => <ScoreBadge score={row.original.score} severity={row.original.severity} />,
  },
  {
    accessorKey: "target",
    header: "Target",
    cell: ({ row }) => (
      <div className="min-w-0 max-w-[280px] truncate" title={row.original.target}>
        <Link
          to={`/tasks/${row.original.id}`}
          className="font-mono hover:underline"
          style={{ color: "var(--color-fg-0)" }}
        >
          {row.original.target}
        </Link>
      </div>
    ),
  },
  {
    accessorKey: "family",
    header: "Family",
    cell: ({ row }) =>
      row.original.family ? (
        <Badge variant="crit">{row.original.family}</Badge>
      ) : (
        <span style={{ color: "var(--color-fg-2)" }}>—</span>
      ),
  },
  {
    accessorKey: "package",
    header: "Pkg",
    cell: ({ row }) => (
      <span className="font-mono text-[11px]" style={{ color: "var(--color-fg-1)" }}>
        {row.original.package || "—"}
      </span>
    ),
  },
  {
    accessorKey: "machine",
    header: "Machine",
    cell: ({ row }) => (
      <span className="font-mono text-[11px]" style={{ color: "var(--color-fg-2)" }}>
        {row.original.machine || "—"}
      </span>
    ),
  },
  {
    accessorKey: "signatures_count",
    header: "Sigs",
    cell: ({ row }) => row.original.signatures_count || 0,
  },
  {
    accessorKey: "submitted",
    header: "Submitted",
    cell: ({ row }) => (
      <span className="font-mono text-[11px]" style={{ color: "var(--color-fg-2)" }}>
        {formatRel(row.original.submitted)}
      </span>
    ),
  },
  {
    accessorKey: "duration",
    header: "Duration",
    cell: ({ row }) => (
      <span className="font-mono text-[11px]" style={{ color: "var(--color-fg-2)" }}>
        {row.original.duration ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusPill status={row.original.status} />,
  },
];

interface TaskTableProps {
  data: TaskSummary[];
}

export function TaskTable({ data }: TaskTableProps) {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id}>
            {hg.headers.map((h) => (
              <TableHead key={h.id}>
                {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={columns.length}
              className="text-center text-xs"
              style={{ color: "var(--color-fg-2)" }}
            >
              No tasks match the current filter.
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((r) => (
            <TableRow key={r.id}>
              {r.getVisibleCells().map((c) => (
                <TableCell key={c.id}>
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function formatRel(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}
