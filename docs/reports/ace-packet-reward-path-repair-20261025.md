# ACE Packet Reward Path Repair — 2026-10-25

## Result

The packet reward source and ACE packet endpoint now use the live `route_runtime_packets` columns and the existing packet-family tables. No database migration or data write was performed in this repair.

## Changes

- `packet-reward-writer.ts` reads the originating packet from `route_runtime_packets` only and rejects a missing source row.
- `/api/ace/packets` creates one UUID, writes its runtime and `route_packets` parent rows plus facts, edges, and state in one transaction, and uses only live runtime columns.
- Packet retrieval is scoped to the authenticated numeric `user_id`.
- `/api/analytics/feedback` checks packet ownership before recording timeline feedback or reward.
- Packet extraction resolves the active model with `resolveLlamaInferenceTarget`; it does not hardcode a Gemma model ID.
- The three route-migration registry paths now resolve relative to `sveltekit-frontend/drizzle/`.

## Evidence

- Read-only PostgreSQL catalog check: `route_runtime_packets`, `route_packets`, `route_packet_rewards`, `route_packet_facts`, `route_packet_edges`, and `route_state_snapshots` all exist.
- `route_runtime_packets` includes `packet_uuid`, `user_id`, `query_hash`, `feature_ids`, `som_cluster`, and `raw`; it does not include `feature_id`, `prompt_hash`, or `reward`.
- Historical runtime rows: 0 of 11 have a packet UUID. `route_packet_rewards` contains 0 rows. No historical rows were backfilled.
- All four registered route-migration files resolve on disk.

## Validation and errors

- Focused Vitest: 4 files, 10 tests passed.
- `npx tsc --noEmit --pretty false`: passed with no diagnostics.
- `git diff --check`: passed; Git emitted only its existing LF-to-CRLF notices.
- Initial Vitest attempts stalled before reporting. The first completed run exposed a test-harness mismatch (the route test expected rendered SQL text while using the real Drizzle `sql` tag); adding a focused SQL mock fixed the harness, and the rerun passed.
- One route-file patch attempt failed to write; the successful retry and final tests/typecheck verified the resulting file state.

## Remaining boundary

These checks prove fixture behavior and current schema shape, not a live ingestion/reward transaction. Before enabling production ingestion, run one authorized packet through the route in an approved test environment, then independently read back its UUID, owner, parent, facts/state, and reward. The route rejects actors whose authenticated ID cannot be represented as the existing integer `user_id` without an authoritative mapping.
