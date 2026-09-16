# Codex Bridge Notes

Use this repo as a Postgres-first Engram stack.

Canonical lanes:
- Postgres + pgvector: durable memory truth
- Qdrant: semantic recall and tagging
- Redis: hot memory and cache keys
- SeaweedFS: canonical object storage via the S3 gateway
- ACE / NES: context cards and prompt injection
- TurboVec / Karpathy / SOM: quantization, clustering, and routing hints

OpenCode / Claude-Mem:
- treat as an observation source only
- do not make SQLite canonical
- do not duplicate memory backends
- mirror sanitized observations into `POST /api/memory/claude-mem`

Helper:
- `node scripts/opencode/post-memory.mjs --file <observation.json>`
- `npm run opencode:post-memory -- --file <observation.json>`

Audit and safety:
- see `docs/architecture/opencode-claude-mem-bridge.md`
- see `docs/operations/stack-audit-playbook.md`
- port checks: `5173`, `37777`, `8788`, `8791`, `8792`, `8793`

If a feature exists in another lane, carry the logic forward only if it maps cleanly to this stack and does not break canonical feature IDs, labels, or storage ownership.

Recent Parent Atlas findings:
- `packet_id` stays the canonical UUID identity.
- `packet_ulid` is now the sortable workflow/order field for packet lineage.
- `packet_key` remains the deterministic duplicate/content guard.
- `title_id` is a derived semantic grouping key, not an identity key.
- `canonical_source_ref` is now populated across the packet ledger to keep source provenance aligned.
- The current backfill left one malformed legacy packet row needing source-side repair rather than generic lineage repair.
- `0.0.0.0:8080` is not a valid browser target; Bitfrost is exposed on host `127.0.0.1:3040` and the container listens on `8080`, so use the host URL for browser checks.

Env discovery rule:
- `.env` and `.env.local` stay gitignored; do not relax ignore rules for real secret files.
- Plain content search against the target env paths works for the main repo and `sveltekit-frontend` env files, even though Git still ignores them.
- For file discovery, use `rg --files -g ".env*"` rather than plain `rg --files`.
- If a path falls outside the usual target files, use an explicit override such as `rg -n --hidden --no-ignore "DATABASE_URL|REDIS_URL|TRACE_MCP_URL" .env .env.local sveltekit-frontend/.env sveltekit-frontend/.env.local`.
- For repeatable presence-only audits, use `npm run env:audit` or pass a custom key set such as `npm run env:audit -- --keys DATABASE_URL,POSTGRES_URL,REDIS_URL,VALKEY_URL,QDRANT_URL,NEO4J_URI,TRACE_MCP_URL`.
- Prefer `.env` as the primary source and `.env.local` as the local override when tracing runtime configuration.

Object storage rule:
- SeaweedFS is the canonical object store. Do not add new MinIO-first architecture, docs, or feature names.
- Legacy names such as `minio_key`, `MINIO_*`, or `minio-client.ts` may remain only where the live schema or compatibility layer still requires them.
- New ingestion paths should describe and generate SeaweedFS or generic S3 object keys, while preserving legacy column names until a deliberate schema rename lands.

## Binary bytes, SHA-256, and Parent Atlas revision lineage (2026-09-16)

Keep these concepts separate in every future integration:

- A **bit** is 0 or 1. A **byte** is eight bits and represents an unsigned value from 0 through 255 (`0x00` through `0xff`). This is a value domain for binary buffers, control bytes, packed features, and protocol fields.
- **SHA-256 is not a byte value or a packet ordinal.** It hashes an arbitrary byte sequence and produces a 256-bit digest: 32 bytes, normally rendered as 64 lowercase hexadecimal characters. The canonical text form in Parent Atlas is `sha256:<64 lowercase hex characters>`.
- Hash the exact source bytes. Do not hash a decoded/re-encoded string, newline-normalized text, JSON reserialization, or a UTF-16 representation unless that encoding is explicitly the producer contract.
- A whole-source digest and a chunk digest are different grains. `file_content_hash` identifies whole source bytes; `codebase_chunk_index.content_hash` identifies a chunk. Never compare them directly.
- `workspace_revision`, `source_revision`, `representation_revision`, and `feature_revision` are separate namespaces. A SHA-256-shaped value in one namespace must not be copied into another without an explicit producer contract.
- `packet_key` is a deterministic packet identity/projection key. It is not a substitute for the source digest, workspace revision, or canonical candidate ordinal.
- Qdrant point IDs, Redis/BitFrost keys, centroids, GPU pointers, and topology coordinates are derived projections. They cannot promote or replace PostgreSQL source identity.

Canonical source lineage is:

```text
immutable workspace snapshot
  → Graphify execution_id
  → source_ref + source_revision + exact source-byte digest
  → packet_key + binding_checksum
  → packet→chunk lineage
  → representation_revision
  → derived Qdrant/ACE/GPU projections
```

Promotion requires exact readback of every identity field. Upserts must be idempotent only when the existing row has the same identity and digest. Any differing value is an identity collision, revision mismatch, or content mismatch and must fail closed; never coerce a SHA-256 workspace revision into a legacy integer such as `0`.

Reference standards: NIST FIPS 180-4 defines SHA-256 message digests; Python documents bytes as sequences of integers constrained to `0 <= x < 256`.

## UUID version policy for Parent Atlas identity and indexes (2026-09-16)

UUID formats are lifecycle tools, not replacements for canonical packet/source identity:

- **UUIDv4**: random operational IDs for requests, traces, temporary jobs, and ephemeral runs.
  Never use it for replay-stable packet or training-row identity.
- **UUIDv5**: deterministic name-based IDs from a frozen namespace and canonical name. The
  frozen `PACKET_AGGREGATE_NAMESPACE_V1` is used for derived packet-index matching across
  legacy namespaces. It is a lookup key only and does not authorize a packet upsert.
- **UUIDv7**: time-ordered IDs for newly generated durable events or batches where index locality
  matters. It does not identify source bytes or reconcile historical packets.
- **UUIDv8**: custom application-defined layout only after its bit layout, namespace, checksum,
  and replay semantics are explicitly frozen. Do not add it to packet repair casually.

For YAML/JQ/JSONL indexes, preserve the real namespace and type: UUID as UUID, `packet_key` as
text, and `sha256:<64 hex>` revisions/digests as text. A UUIDv5 index match is admissible only
after exact equality of `packet_key`, `source_ref`, `workspace_revision`, `source_revision`, and
whole-source content digest. Same UUIDv5 key with different canonical fields is an identity
collision. Manifests must record `uuidAlgorithm`, `uuidNamespace`, `uuidName`, and
`canonicalIdentity: false` for derived index UUIDs. PostgreSQL remains canonical; YAML/JQ,
DuckDB, Redis/BitFrost, Qdrant, centroids, and GPU identifiers remain projection layers.

RFC 9562 is the reference for UUIDv4, UUIDv5, UUIDv7, and UUIDv8 semantics.
