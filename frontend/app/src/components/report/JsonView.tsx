import { JsonView, defaultStyles } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";

interface JsonViewerProps {
  data: unknown;
  collapseAtDepth?: number;
}

/**
 * Thin wrapper over react-json-view-lite tuned for the dark theme
 * (severity tokens drive the colour palette).
 */
export function JsonViewer({ data, collapseAtDepth = 2 }: JsonViewerProps) {
  return (
    <div
      className="rounded-md border p-3 font-mono text-[11px]"
      style={{
        background: "var(--color-bg-2)",
        borderColor: "var(--color-border)",
      }}
    >
      <JsonView
        data={data as object}
        shouldExpandNode={(level) => level < collapseAtDepth}
        style={{
          ...defaultStyles,
          container: "",
          basicChildStyle: "ml-4",
          label: "text-[var(--color-fg-1)] font-semibold",
          stringValue: "text-[var(--color-sev-clean)]",
          numberValue: "text-[var(--color-sev-low)]",
          booleanValue: "text-[var(--color-sev-med)]",
          nullValue: "text-[var(--color-fg-2)]",
          undefinedValue: "text-[var(--color-fg-2)]",
          punctuation: "text-[var(--color-fg-2)]",
          collapseIcon: "text-[var(--color-fg-2)] cursor-pointer",
          expandIcon: "text-[var(--color-fg-2)] cursor-pointer",
          collapsedContent: "text-[var(--color-fg-2)]",
        }}
      />
    </div>
  );
}
