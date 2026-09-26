# Runtime / side-effects lane

Question: does the run do only what it claims?

- Live audits run in one `REPEATABLE READ READ ONLY` transaction and end in ROLLBACK. Report writes per store (postgres/qdrant/valkey/rabbitmq/neo4j/graphify), all zero for read-only proofs.
- Order: Postgres write first, cache invalidate after, events last. ADV005/006/015 in `prove-gan-adversarial-v1.mts` exercise this.
- Dry-run must have no side effects; a mocked or fallback client is WIRED at best.
- Zero rows or an empty batch is BLOCKED, not PASS (exit 2, `GAN_LIVE_PACKET_PROOF_BLOCKED`).
- Receipts are exclusive-create; a failed run stays as history. A failing step records `null` plus a reason and the run continues; null never promotes.
- Host quirks: `cudaMemGetInfo` overstates free VRAM on Windows; use `nvidia-smi`. `docker exec` directly, not Node wrappers.
