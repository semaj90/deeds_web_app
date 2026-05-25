# Wire Graph Export Generator

## 1. Copy the generator
Copy:
```txt
generate-graph-exports.mjs
to:
```txt
sveltekit-frontend/scripts/atlas/generate-graph-exports.mjs

If `scripts/atlas` does not exist:

```powershell
New-Item -ItemType Directory -Force scripts/atlas
```
## 2. Add package scripts
In `sveltekit-frontend/package.json`, add:
```jsonc
"graph:exports": "node scripts/atlas/generate-graph-exports.mjs",
"graph:exports:smoke": "npm run graph:exports && duckdb\\smoke-duckdb.ps1"
``

Optional alias:

```jsonc
"feature:atlas:exports": "npm run graph:exports"
```
## 3. Run

```powershell
npm run graph:exports
duckdb\smoke-duckdb.ps1
``
or:
```powershell
npm run graph:exports:smoke
```
## 4. Expected outputs
```txt
memory/exports/graph-refresh-manifest.json
memory/exports/cluster-cards.jsonl
memory/exports/pathway-cards.jsonl
```
Manifest should say:
```json
{
  "status": "generated",
  "promotionState": "unpromoted"
}
```
## 5. Important

This replaces stubs with generated artifacts, but it still does not promote them as production graph truth.
Promotion should happen only after a later validation step.
