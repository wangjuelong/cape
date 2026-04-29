interface LiveIndicatorProps {
  connected: boolean;
}

export function LiveIndicator({ connected }: LiveIndicatorProps) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider"
      style={{ color: connected ? "var(--color-sev-clean)" : "var(--color-fg-2)" }}
      title={connected ? "Receiving live updates" : "Connecting…"}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{
          background: connected ? "var(--color-sev-clean)" : "var(--color-fg-2)",
          animation: connected ? "pulse 1.6s ease-in-out infinite" : undefined,
        }}
      />
      {connected ? "Live" : "Connecting"}
    </span>
  );
}
