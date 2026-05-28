# Token / Card Weight Updater — Pipeline Notes

Purpose
- Periodically computes weights/scores for token→card and card→token associations used for ranking in the Atlas UI.

Execution
- The updater is an offline, periodic job. Run manually or via a scheduled batch; it is intentionally not part of application startup or the prompt path.
- Dry-run (default): `npm run atlas:weights:update` — writes files under `.tmp/` and `reports/` only.
- Publish to Redis: add the `--redis` flag explicitly: `npm run atlas:weights:update -- --redis`.

Safety & Semantics
- The updater is read-only with respect to production data sources: it reads DB/Qdrant/inputs and writes only local artifact files in dry mode.
- Redis publish is opt-in only and requires the `--redis` flag; no Redis writes occur during the dry run.
- The updater does not change CI/startup tasks and must not be wired to application startup pipelines.

Outputs
- `.tmp/token-card-weights.jsonl` — line-delimited JSON records with fields including `card_id`, `sourceRef`, feature columns, and `final_score` (when available).
- `reports/token-card-weight-summary.md` — human-readable summary and scoring formula.

Interpretation rules
- Do **not** infer `implemented` or `promoted` status from weights alone. Weights are signals for ranking and prioritization only — promotions or feature flags must be decided by product/ops workflows and recorded separately.
- When reviewing the dry-run outputs, validate `sourceRef` and `card_id` are present for entries; empty or zero-count outputs indicate no inputs were processed and require further investigation.

Operational checklist (before publishing to Redis)
1. Run dry mode and review `.tmp/` and `reports/` outputs.
2. Confirm `sourceRef`/`card_id` present and that scores look sane in `reports/token-card-weight-summary.md`.
3. Only after human review, run with `--redis` to publish. The publish step is explicit and manual.

Implementation notes
- The script lives at `scripts/atlas/token-card-weight-updater.mjs`.
- Redis publish path is gated behind a CLI flag and uses typed Redis helpers from `src/lib/server/redis.ts`.
- The updater is intentionally excluded from startup and CI automation until we have an approved review process.

Contact
- For questions about scoring formula or promoting weights to product flags, contact the Atlas owners or the engineering lead.
