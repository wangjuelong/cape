import { Link } from "react-router-dom";

/**
 * Client-side 404 — rendered by React Router when no other route matches.
 * Backend Smart404Middleware serves the SPA shell for unmatched browser
 * paths (status 200), and this component takes over rendering.
 */
export default function NotFoundRoute() {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        height: "100%",
        gap: 16,
        padding: "48px 16px",
        textAlign: "center",
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 48,
          fontWeight: 600,
          letterSpacing: "0.04em",
        }}
      >
        404
      </div>
      <div className="dim" style={{ fontSize: 14 }}>
        The page you requested does not exist.
      </div>
      <Link
        to="/"
        className="btn primary"
        style={{ height: 30, padding: "0 16px", fontSize: 12 }}
      >
        Go to dashboard
      </Link>
    </div>
  );
}
