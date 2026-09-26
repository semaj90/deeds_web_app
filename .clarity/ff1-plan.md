# FF1 Plan — Optimized OOM-Safe Audit

## Objective
Get reliable error counts from the sveltekit-frontend TS/Svelte type-checking pipeline,
using an OOM-safe subset that is fast enough to iterate on.

## Strategy: two-tier validation
Run two independent tools and cross-check their error locations:
- **Tier 1 (fast):** `tsgo --noEmit` (TypeScript 7 native, OOM-safe, ~seconds).
- **Tier 2 (authoritative):** `svelte-check` (full Svelte 5 type-check), but guarded
  by an allowlist so it only touches a small subset of files.

## Phase 1 — Baseline (record current truth)
1. Establish the current error baseline. Prefer the **tsgo** subset for speed and OOM-safety.
2. Capture the count of errors and their locations (file + line).
3. Save baseline to `.clarity/ff1-baseline.json` and a human-readable `.clarity/ff1-baseline.md`.

## Phase 2 — Allowlist (the key to OOM-safety)
1. Determine the minimal set of files to include so svelte-check is OOM-safe and fast.
2. Write allowlist to `.clarity/ff1-allowlist.json` (list of file paths).
3. Configure svelte-check to respect the allowlist (via a dedicated tsconfig or CLI filter).

## Phase 3 — Report (compare → recommend)
1. Run svelte-check on the allowlist, compare error locations to the tsgo baseline.
2. Produce a report:
   - **Errors found** (tier-2 confirmations + any tier-1-only items).
   - **Recommendations** for full-pipeline progress, respecting OOM-safety.
3. Save report to `.clarity/ff1-report.md`.

## Guardrails
- NEVER run full svelte-check over all files — OOM risk.
- tsgo is the primary fast signal; svelte-check is the authoritative confirmation.
- If either tool OOMs, fall back to the other tier.
