# Task Packet Writer and AST Ranking Review — 2026-10-28

## Outcome

The `POST /api/tasks/packets` writer now resolves a stored PacketKeyV2 identity before insert and rejects missing, ambiguous, malformed, or source-mismatched identity. It does not derive identity from `feature_id`, a path, a timestamp, or a random value. This is a code-only correction; it is not evidence that the live database is ready for writes.

## Writer changes

- `packet-identity-resolver.ts` adds a task-write resolver that accepts an existing PacketKeyV2 key and/or an exact `atlas_packets.source_ref` lookup. If both are supplied, they must resolve to the same canonical key.
- The route requires a non-empty `source_ref` or `file_path`, resolves the canonical key before insert, and returns typed 400/409 failures without reaching persistence when the identity is unusable.
- Its `RETURNING` projection is restricted to columns present in the live-table audit; broad Drizzle `.returning()` would request Drizzle-only columns absent from the live table.
- The Drizzle mirror now represents `packet_key` as `varchar(255) NOT NULL`, matching the reported live constraint. No DDL or database migration was applied.
- `createTaskSemanticPacket` now includes a resolved `packet_key`, but its loaded `workspace_tasks` shape does not expose a proven source reference or packet key. It therefore fails closed unless an identity-bearing task row is provided. The synthetic `${workspace}:task:${id}` reference is not accepted as canonical identity.

## Validation and limits

- Focused Vitest: 26/26 pass across the packet identity resolver, route contract, and semantic-packet service tests.
- `npm run check` did not complete: `svelte-check` remained at “Getting Svelte diagnostics” for more than two minutes and was interrupted. An earlier invocation reported one unrelated error in `src/lib/server/atlas/contracts/multiruntime-worker-receipt-v1.ts:153`; a clean full check is not established.
- No live HTTP/database integration test was run. The migration remains unapplied, and existing schema compatibility guards can still block the service path.
- The demo caller that supplies only `feature_id` cannot pass the new identity gate; this is intentional until it has a genuine source identity.

## AST ranking review

Commit `8bffbe01208` added a large mixed-scope change (59 files; over 1.2 million inserted lines, dominated by generated reports). A later simplification replaced its inventory-bound producer with a full-tree scanner, while the fixture test still expected the inventory-bound contract. The test initially passed falsely because it reused stale output files from `.tmp/atlas/ast-fact-fixture-test`; the producer ignored the test's output environment variables. The scratch directory is now cleared before each test, the inventory-bound producer has been restored with repository-root path confinement, and the rank SQL now consumes the producer's per-file summary schema. The AST rank remains diagnostic/proposal-only until a complete ranking replay is independently reviewed.

The deterministic ranking remains a proposal aid, not a verified defect classifier or canonical admission mechanism; URL/TODO/request-flow review counts do not independently prove defects. Ranking outputs are generated only in a separate scratch working directory below.

## AST producer contract repair and replay (2026-10-28)

- The cleaned fixture suite passes **1/1** and now proves inventory-bound source digests, UTF-8 span evidence, independent ast-grep agreement, deterministic replay, and rejection of an out-of-repository source reference. Node syntax validation and `git diff --check` pass (Git reports the existing line-ending warning).
- Full read-only replay used `.tmp/atlas/source_file_inventory-local-snapshot-20261027-v1.parquet` (SHA-256 `sha256:a0142e66fd137ce013e462103a78483aa470207b84b7ad8dad2ae553af10920b`) and the exact-path/digest bindings CSV. It considered 6,789 records: 6,706 analyzed, 78 source-digest mismatches, 5 UTF-8 round-trip mismatches, 0 missing files, and 5,552 exact-bound source files. The workspace/binding provenance does not confer canonical authority.
- Fresh output receipts: facts SHA-256 `sha256:854871beedfffc68599f6c740c20b054a85c00cb634cf7ea0cef54bdd2e989d4`; summary SHA-256 `sha256:c727aefde671dc1d073420d2e634ef43210119d0e0f0c2cb6d5da704e11043b9`. An independent checksum readback matched both. Request-body AST-grep corroboration: 506 agreed, 0 disagreement, 0 uncovered. Summary review signals: 99 unresolved request-flow reviews, 482 non-test URL literals, 84 TODO comments, 0 legacy Svelte constructs, 0 compiler parse errors.
- Corrected `directory-remediation-rank-v1.sql` to aggregate `review_required_request_json`, `URL_LITERAL`, `TODO_COMMENT`, and `LEGACY_SVELTE_SYNTAX` from the per-file summary JSONL. Ran the ranking SQL from a new isolated scratch working directory so its fixed relative output paths could not overwrite the existing `.tmp/atlas` ranking or tickets. It processed 1,605 directories (197 `CLEANUP`, 1,408 `RECOMMEND`), with 97 directories carrying request-flow review signals and 1,323 directories exactly bound to the supplied snapshot. The diagnostic `score_ast` exceeds baseline `score` in 103 directories; that is not evidence of ranking quality. Ticket generation still uses baseline `score`.
- All 50 isolated dry-run ticket rows passed a Zod validation mirror of the route's current `CreateTicketActionSchema` (0 invalid); this was an offline schema-mirror check, not a call to the route. Two isolated SQL replays produced byte-identical rank and ticket outputs. Rank artifact SHA-256: `116c091775169eeaec8c691d6379a05584ab4d032925f7068e3fa9dde5c70766`; ticket JSONL SHA-256: `5e324194a367118a07b5bcd3b72ac5e7d0b88918e4142d0a9604454b469443d0`. The pre-existing root-level ranking and ticket files retain their original sizes and modification times. No queue, service, database, canonical, S3, or Valkey writes occurred.
- These results are parser/rule observations only. In particular, the 99 unresolved request flows are review candidates, not confirmed missing validation or security defects.

## Authority boundary

No datastore writes, migration, Graphify run, source-reference registration, Valkey hydration, S3 upload, GPU job, branch merge, or commit occurred. Canonical Gate V2 remains `FAIL`. Ready for code review only; not ready for live persistence or promotion.
