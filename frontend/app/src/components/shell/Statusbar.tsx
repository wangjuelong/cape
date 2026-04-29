export function Statusbar() {
  return (
    <div
      className="flex h-6 items-center gap-4 border-t px-3 text-[10px]"
      style={{
        background: "var(--color-bg-1)",
        borderColor: "var(--color-border)",
        color: "var(--color-fg-2)",
      }}
    >
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--color-sev-clean)" }}
        />
        cape-host · online
      </span>
      <span>—</span>
      <span className="flex-1" />
      <span style={{ fontFamily: "var(--font-mono)" }}>build 0.1.0 · spa</span>
    </div>
  );
}
