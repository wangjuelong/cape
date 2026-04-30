interface LiveIndicatorProps {
  connected: boolean;
}

export function LiveIndicator({ connected }: LiveIndicatorProps) {
  return (
    <span
      className="mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 10.5,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: connected ? "var(--color-sev-clean)" : "var(--color-fg-2)",
      }}
      title={connected ? "Receiving live updates" : "Connecting…"}
    >
      <span
        style={{
          display: "inline-block",
          height: 6,
          width: 6,
          borderRadius: "50%",
          background: connected ? "var(--color-sev-clean)" : "var(--color-fg-2)",
          boxShadow: connected ? "0 0 6px var(--color-sev-clean)" : undefined,
          animation: connected ? "pulse 1.6s ease-in-out infinite" : undefined,
        }}
      />
      {connected ? "Live" : "Connecting"}
    </span>
  );
}
