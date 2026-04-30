/**
 * Hidden form mirror — renders a native `<input type="hidden" name="X">`
 * alongside Radix-driven controls so:
 *
 *   1. The DOM exposes the canonical field name (parity with upstream
 *      `web/submission` Bootstrap form, which is what the parity Playwright
 *      spec scrapes).
 *   2. The form would still submit a sane multipart payload if JS were
 *      ever disabled — graceful degradation.
 *
 * Boolean → "1" / "" so checkboxes round-trip correctly through the
 * `parse_request_arguments` helper.
 */
interface HiddenMirrorProps {
  name: string;
  value: unknown;
}

export function HiddenMirror({ name, value }: HiddenMirrorProps) {
  let str: string;
  if (value === null || value === undefined) {
    str = "";
  } else if (typeof value === "boolean") {
    str = value ? "1" : "";
  } else {
    str = String(value);
  }
  return <input type="hidden" name={name} value={str} readOnly />;
}
