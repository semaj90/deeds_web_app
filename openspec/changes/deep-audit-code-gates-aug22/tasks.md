## 1. Index hygiene (found this pass, not fixed)

- [ ] 1.1 Exclude `scripts/api-cleanup/` (whole directory, ~2,558 stale route-file backups), `llama-cpp-turboquant-gemma4/`, `tools/agentic-research/`, `scripts/phase104-backups/`, `granite-docling-258M/` from the indexer's file inventory (`npm run index:codebase:fast` / `graphify:daily`) so raw gate counts aren't inflated by vendor/backup noise. Confirm no other backup-shaped directories exist via `find . -iname '*backup*' -maxdepth 4 -type d`.
- [ ] 1.2 Re-run `npm run graphify:daily` to refresh the index (currently 33.9h stale at time of this audit) before trusting any fail count here for fixing.

## 2. Resolve the G5 schema-drift ambiguity (blocks trusting G5's count)

- [ ] 2.1 Determine whether `f.parsesBody` (referenced by CLAUDE.md's deep-audit dispatch table for G5) was ever a real field that got dropped from the indexer, or a documentation error that never matched implementation. Check `scripts/index-codebase-fast.mjs` (or whatever the actual indexer script is) for its field-emission list.
- [ ] 2.2 Reconcile this session's approximation (routeHandlers-mutating-method + hasZod===false → 47 fails) against the graph's own precomputed `gateStats.routesWithoutZod: 23` — figure out which is closer to CLAUDE.md's actual intended G5 definition, or whether both are wrong.
- [ ] 2.3 Update CLAUDE.md's dispatch table to match whatever the indexer actually emits, once resolved — stop future audits from silently trusting a field that doesn't exist.

## 3. Fix mechanical/low-risk gate fails (once index is refreshed per 1.2)

- [ ] 3.1 G16 (67 fails): `npm run audit:test-stubs --filter <path>` per failing route, or in bulk.
- [ ] 3.2 G26 (4 fails): add `// @vitest-environment node` to `tests/routes/all-routes-page.test.ts`, `cache-stats.test.ts`, `codebase-tags-rename.test.ts`, `phase109-tag-chunks.test.ts`.
- [ ] 3.3 G14 (3 fails, all scratch files): decide whether to archive `sveltekit-frontend/temp_upload.svelte`, `test-errors-validation.svelte`, `test-errors.svelte` per repo's archive-not-delete convention, or confirm they're intentionally kept as manual test fixtures.

## 4. Fix gate fails needing per-file judgment

- [ ] 4.1 G4 (47 fails): review each `+server.ts` missing `locals.user` — some (`/api/acp/rpc`, `/api/admin/atlas/*`) may be intentionally internal/service-to-service and not need a user-session guard; don't blanket-add auth without checking intended access model per route.
- [ ] 4.2 G5 (47 fails, pending task 2's resolution): Zod-validate request bodies on confirmed-real fails only, per CLAUDE.md's Superforms/Zod pattern.
- [ ] 4.3 G11 (41 fails): wrap bare `localhost`/`127.0.0.1` literals in `ENV.SERVICE_URL ?? 'http://localhost:N'` per the repo's own G11 fix pattern.
- [ ] 4.4 G20 (16 cyclic pairs): not yet enumerated per-file — run CLAUDE.md's G20 gate command directly to get the pair list before deciding whether any need breaking.
- [ ] 4.5 G25 (25 rune-in-plain-.ts files): not yet enumerated per-file — these are real Svelte 5 rune-compliance violations (`$state`/`$derived`/`$effect`/`$props` used in a plain `.ts` file where reactivity is inert) — enumerate and fix by moving to `.svelte.ts` or removing the misplaced rune call.

## 5. D9 orphan verification (explicitly deferred, not run this pass)

- [ ] 5.1 Run `npm run audit:d9:full-chain` to convert the raw 14,943 fanIn=0 candidates into verified classifications (per this repo's own ~95% false-positive-rate warning for the raw D9 signal). Do NOT treat the raw 14,943 as a deletion list under any circumstances.

## 6. Remaining gate suites (explicit next step of this same request)

- [ ] 6.1 Run `data` suite (G10-G12: schema refs, localhost refs cross-check, vector/Qdrant coupling) and record findings here.
- [ ] 6.2 Run `infra` suite (G27-G47: pytorch-graph wiring, glyph/cartridge/ACE) — these need filesystem existence checks and live `rg` greps per CLAUDE.md, not just graph JSON reads.
- [ ] 6.3 Run `tier-h` suite (G48-G55: search analytics + ACE feedback loop) — same, live greps required.
- [ ] 6.4 Run the 17-gate backend infrastructure audit (`bash scripts/audit/backend-infrastructure-audit.sh`) for a runtime-service-health complement to the above static-code gates.
