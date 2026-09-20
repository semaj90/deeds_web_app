# Parent Atlas Agentic Completion & Error-Fixing Runtime

## Planning / proof status

- [x] **AGENT-01 — Controller adapter.** Read the full execution-controller task population and select only current `ACTIONABLE` tasks.
- [x] **AGENT-02 — Authentication boundary.** Require session identity; allow development bypass only with the explicit environment flag.
- [x] **AGENT-03 — Completion-envelope validation.** Bind goal, revision, required gates, fallbacks, scope budget, and checksum to selection.
- [x] **AGENT-04 — Smoke-profile allowlist.** Reject arbitrary request commands and execute only server-owned bounded profiles.
- [x] **AGENT-05 — GAN receipt.** Emit `created`, `wired`, `proven`, `done`, proof references, and `promotionAuthorized=false`.
- [x] **AGENT-06 — Read-only integration proof.** Controller selection → LangGraph → smoke → receipt → reconciliation passes without task or canonical-store writes.
- [x] **AGENT-07 — OKF freshness audit.** Validate claim/source/evidence revisions and checksums without installing OpenWiki or promoting claims.
- [x] **AGENT-08A — Immutable repair request.** Bind every selected task to a checksummed plan-only request at the controller boundary; no queue or canonical writes.
- [x] **AGENT-08 — Worker boundary.** Move long-running repair/tournament execution behind an immutable request and worker queue. Proven by the opt-in external worker, one live checksummed fixture publish, plan-only execution, ACK settlement, and queue readback at `0 ready / 0 unacknowledged`; no canonical writes or promotion.
- [ ] **AGENT-09 — Tournament reuse.** Complete the existing graph-retrieval-proof three-candidate seam; do not create a second tournament owner.
- [ ] **AGENT-10 — Durable receipts.** Propose Drizzle-owned receipt history only after the read-only contract is accepted; keep it separate from LangGraph checkpoints.

## Completion rule

The first tranche is complete when AGENT-01 through AGENT-08A remain proven by focused tests and current receipts. AGENT-08 through AGENT-10 are explicitly deferred and cannot be inferred complete from the current API smoke.
