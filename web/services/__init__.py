"""Service layer for v3 endpoints (PRD §9 R4, R7).

This package isolates v3 views from direct ORM / MongoDB access. Views
parse parameters and serialize responses; services own the business
logic and the cross-store consistency rules.

Two consequences:

- v3 views never call ``Database`` methods or ``mongo_find_*`` directly.
  They go through the service modules below.
- v2 views are unchanged for now; later they may be migrated to call the
  same services to eliminate the v2/v3 dual logic burden (PRD §9 R4).

Submodules:

- ``task_service``: task CRUD + listing + search.
- ``report_service``: report retrieval, including all Mongo field path
  centralisation. New v3 report endpoints MUST live here.
"""
