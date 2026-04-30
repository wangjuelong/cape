import { PageHead } from "./PageHead";

interface StubPageProps {
  title: string;
  crumbs?: string[];
  description?: string;
  todo?: string[];
}

/**
 * Placeholder for routes that have not yet wired to v3 data. Renders the
 * design's `.panel` shell so the SOC look is preserved even on stub pages.
 */
export function StubPage({ title, crumbs, description, todo }: StubPageProps) {
  return (
    <>
      <PageHead crumbs={crumbs ?? ["CAPE", title]} />
      <div className="scroll" style={{ padding: 14 }}>
        <div className="panel" style={{ maxWidth: 720 }}>
          <div className="panel-h">
            {title}
            <span className="count">· pending implementation</span>
          </div>
          <div style={{ padding: 14 }}>
            {description && (
              <p
                style={{
                  margin: 0,
                  marginBottom: 14,
                  fontSize: 12,
                  color: "var(--color-fg-1)",
                  lineHeight: 1.6,
                }}
              >
                {description}
              </p>
            )}
            {todo && todo.length > 0 && (
              <>
                <div
                  className="dim mono"
                  style={{
                    fontSize: 10.5,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: 600,
                    marginBottom: 6,
                  }}
                >
                  Pending wires
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    fontSize: 11.5,
                    color: "var(--color-fg-1)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {todo.map((item) => (
                    <li key={item} style={{ marginBottom: 4 }}>
                      {item}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
