# Parent Atlas Open Lanes TODO

Generated from the current workstation evidence. This is the finish list for the remaining open lanes.

## Already Wired

- OpenCode bootstrap now pulls ACE/recommendation evidence and verifies Bitfrost without blocking on a full startup-truth sweep.
- Recommendation materialization no longer forwards to the legacy Gemma4 hook by default.
- Parent Atlas, feature lineage, runtime packet, and PostgreSQL mirror audits are already in place.

## Open Lanes

### 1. Engram / Gemma4 memory wiring
- Status: partial
- Missing: explicit Engram adapter decision report
- Finish line:
  - keep Engram hint-only unless a first-class adapter is explicitly justified
  - keep `repo_report_answer` as the repo-audit path
  - keep `gemma4_chat` deprecated
  - use `npm run atlas:engram-adapter:decision` to track the lane
  - review `sveltekit-frontend/docs/reports/engram-adapter-decision-report.md` for the current decision

### 2. Parent Atlas overlay sync
- Status: partial
- Missing: frontend overlay parity for the root atlas registry
- Finish line:
  - keep `sveltekit-frontend/docs/atlas/feature-registry.json` mirrored from the root registry
  - keep doc-indexing reading app-side reports first

### 3. Feature-gap registry completion
- Status: partial
- Missing: row-level reconciliation for the remaining live gaps
- Finish line:
  - keep the live registry regenerated from the synced overlay
  - reconcile the remaining missing rows without broad ingest

### 4. Graph / KAG / DAG refresh manifest
- Status: partial
- Missing: invalidation and promotion coordination
- Finish line:
  - wire refresh-manifest invalidation to atlas truth promotion
  - keep graph refreshes from drifting away from the promoted truth

### 5. PyTorch / LibTorch feature extraction lane
- Status: partial
- Missing: a named workstation completion artifact
- Finish line:
  - bind the existing GPU outputs to the parent atlas registry
  - keep the canonical `768 -> 256 -> 64` lane intact

### 6. XGBoost / gradient tree boosting reranker
- Status: partial
- Missing: formal reranker contract
- Finish line:
  - decide whether XGBoost stays a side-channel hotness scorer or becomes a formal reranker input
  - keep phase 18 bounded until the contract is explicit

## Finish Order

1. Engram adapter decision
2. Parent Atlas overlay sync
3. Feature-gap registry reconciliation
4. Graph refresh invalidation / promotion wiring
5. PyTorch workstation artifact
6. XGBoost reranker contract

## Exit Criteria

- Parent Atlas reports stay app-root aware.
- OpenCode sessions use ACE hits, recommendations, and Bitfrost evidence first.
- No lane depends on a hidden legacy Gemma4 forwarding path.
- The open lanes have explicit commands and evidence files.
