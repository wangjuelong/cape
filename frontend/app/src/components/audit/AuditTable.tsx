import type { AuditActionDescriptor, AuditEvent } from "@/lib/api/audits";

import { AuditRow } from "./AuditRow";

interface AuditTableProps {
  events: AuditEvent[];
  catalog: AuditActionDescriptor[];
}

export function AuditTable({ events, catalog }: AuditTableProps) {
  return (
    <table className="data" style={{ width: "100%", tableLayout: "fixed" }}>
      <thead>
        <tr>
          <th style={{ width: 110 }}>Time</th>
          <th style={{ width: 120 }}>Actor</th>
          <th style={{ width: 200 }}>Action</th>
          <th>Target</th>
          <th style={{ width: 130 }}>IP</th>
          <th style={{ width: 24 }}> </th>
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <AuditRow key={e.id} event={e} catalog={catalog} />
        ))}
      </tbody>
    </table>
  );
}
