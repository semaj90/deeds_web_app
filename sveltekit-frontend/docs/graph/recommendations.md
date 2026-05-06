# Codebase Recommendations
Generated: 2026-05-06T23:03:27.824Z
Graph source: `deep-import-graph.json`
next_steps/active/ files cross-referenced: 2026-05-03-auth-gaps.md, 2026-05-03-directory-consolidation.md, 2026-05-03-production-blockers.md, 2026-05-03-production-readiness-master.md, 2026-05-05_inverted-features-build-order.md, 2026-05-05_unwired-features-wiring-plan.md

## Summary
| | Count |
|---|---|
| Total recommendations | 8 |
| Net-new (not in next_steps) | **1** |
| Already tracked | 7 |

---

## Net-New Recommendations

### 🟡 R3-hotspots — 30 files each depended on by >50 files transitively
**Severity**: medium | **Files**: 30

Changes to these files risk breaking many consumers. Add comprehensive tests and consider versioned interfaces.

- `src/lib/server/env.server.ts`
- `src/lib/server/redis.ts`
- `src/lib/server/db/schema/citations.ts`
- `src/lib/db/schema/ace-web.ts`
- `src/lib/server/db/schema/analytics.ts`
- `src/lib/server/db/schema-canvas-autosaves.ts`
- `src/lib/server/db/schema-canvas.ts`
- `src/lib/server/db/schema-chat.ts`
- `src/lib/server/db/schema-evidence-crud.ts`
- `src/lib/server/db/schema-phase89-preserved.ts`
_...and 20 more_


---

## Already Tracked in next_steps/active/

- **R2-cycles-large**: 3 circular dependency chains of 3+ files _(high)_
- **R4-missing-auth**: 8 API route handlers lack auth guards _(high)_
- **R1-orphans**: 149 files have 0 importers and are not entrypoints _(medium)_
- **R5-missing-zod**: 127 API routes lack Zod input validation _(medium)_
- **R6-untested-cycles**: 22 files in circular dependency chains have no paired test _(medium)_
- **R7-unwired-impl**: 38 substantial files import libraries but have 0 consumers _(medium)_
- **R2-cycles-small**: 7 2-file circular dependency pairs _(low)_

---

## Recommendations → next_steps/ Action Plan




### Near-term (Medium severity)
- [ ] **R3-hotspots**: 30 files each depended on by >50 files transitively



