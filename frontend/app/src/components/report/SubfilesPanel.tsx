/**
 * "Subfile Information" card — files extracted from archives /
 * overlay / self-extraction. Mirrors upstream's `selfextract` table.
 */
import type { SubfileEntry } from "@/lib/api/reports";

interface SubfilesPanelProps {
  subfiles: SubfileEntry[];
}

export function SubfilesPanel({ subfiles }: SubfilesPanelProps) {
  if (!subfiles || subfiles.length === 0) return null;
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-h">
        Subfile Information <span className="count">· {subfiles.length}</span>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ overflowX: "auto" }}>
          <table className="data mono" style={{ fontSize: 10.5, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ width: 90 }}>Method</th>
                <th>Name</th>
                <th style={{ width: 200 }}>Type</th>
                <th style={{ width: 90, textAlign: "right" }}>Size</th>
                <th style={{ width: 150 }}>MD5</th>
              </tr>
            </thead>
            <tbody>
              {subfiles.slice(0, 100).map((f, i) => (
                <tr key={`${f.sha256}-${i}`}>
                  <td className="dim">{f.method}</td>
                  <td
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 320,
                    }}
                    title={f.path || f.name}
                  >
                    {f.name}
                  </td>
                  <td
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={f.type}
                  >
                    {f.type || <span className="dim">—</span>}
                  </td>
                  <td className="dim" style={{ textAlign: "right" }}>
                    {f.size != null ? `${f.size}` : "—"}
                  </td>
                  <td
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={f.md5}
                  >
                    {f.md5 || <span className="dim">—</span>}
                  </td>
                </tr>
              ))}
              {subfiles.length > 100 && (
                <tr>
                  <td colSpan={5} className="dim" style={{ textAlign: "center", padding: 6 }}>
                    … and {subfiles.length - 100} more
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
