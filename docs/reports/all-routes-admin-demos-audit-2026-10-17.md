# All-Routes, Admin & Demos Organization & Health Audit (`ALL-ROUTES-ADMIN-DEMOS-AUDIT-01`)

- **Generated At**: `2026-10-17T19:06:34.009Z`
- **Workspace Revision**: `e1cbfd496149`
- **Denominator Reconciliation**:
  - Filesystem Pages: `237` (`202` static, `35` dynamic)
  - Target `/admin` + `/demos` Static Pages: `130`
  - Phase 72 `route-ast-graph.json` Nodes: `1495` (`1413` unique route paths, `0` rejected)
  - Lineage Breakdown (Filesystem Pages): `PROVEN=27`, `PARTIAL=0`, `MISSING=210`
  - Active Browser Crawl (`logs/task-output/route-hardening/`): `202` route logs (`status200=139`, `earlierConnRefused=56`, `http5xx=4`)

## 1. Canonical 8 Audit Gates
- `SERVER_REACHABLE`: **PASS** (`status=200`, `6804ms`)
- `ROUTE_INVENTORY_COMPLETE`: **PASS** (`202 + 35 = 237`)
- `CATALOG_SCHEMA_VALID`: **PASS**
- `CATALOG_LINEAGE_QUALIFIED`: **PASS**
- `STATIC_ROUTE_HTTP_PROBED`: **PASS** (`3/3` passed, `0` 500s, `0` transport failures, mode=`critical_hubs_crawl_safe`)
- `DYNAMIC_ROUTE_CLASSIFIED`: **PASS** (`35` dynamic routes classified)
- `SSR_ROUTE_HEALTH`: **PASS** (`/admin`, `/demos`, `/admin/all-routes`)
- `AUDIT_RECEIPT_VALID`: **PASS**

## 2. Catalog & Loader Sub-Gates
- `DEMOS_ZERO_BROKEN_LINKS`: **PASS** (`0` broken)
- `DEMOS_100_PERCENT_INDEXED`: **PASS** (`82/82` indexed)
- `ADMIN_ZERO_BROKEN_LINKS`: **PASS** (`0` broken)
- `ADMIN_100_PERCENT_INDEXED`: **PASS** (`46/46` indexed)
- `ALL_ROUTES_PHASE72_AND_LIVE_MERGE`: **PASS**
- `ZERO_BROKEN_LIB_IMPORTS`: **PASS** (`0` broken `$lib` imports across `132` pages)

## 3. Logged Dead `/api/*` References in `/admin/*` & `/demos/*`
- Zero dead `/api/*` references detected.
