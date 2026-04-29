import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Not really a SPA route — this just bounces the browser to Django allauth.
 * After login, allauth redirects back to LOGIN_REDIRECT_URL (configurable in
 * web/web/settings.py). The default '/' lands on the SPA shell.
 */
export default function LoginBridgeRoute() {
  const [params] = useSearchParams();
  const next = params.get("next") ?? "/";

  useEffect(() => {
    const url = `/accounts/login/?next=${encodeURIComponent(next)}`;
    window.location.replace(url);
  }, [next]);

  return (
    <div className="grid h-full place-items-center text-xs" style={{ color: "var(--color-fg-2)" }}>
      Redirecting to login…
    </div>
  );
}
