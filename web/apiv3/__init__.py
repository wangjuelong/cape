"""apiv3 — REST API namespace for the new SPA frontend.

Coexists with apiv2 (which is preserved verbatim per PRD D-02). All endpoints
under this app return Problem Details on error (4xx/5xx), are documented via
drf-spectacular, and use serializer-driven JSON shapes aligned with
frontend/web-design/data.js (PRD D-14).
"""
