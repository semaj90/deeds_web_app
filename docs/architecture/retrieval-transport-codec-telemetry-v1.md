# Retrieval transport codec observations

The existing `src/lib/server/grpc/retrieval-client.ts` remains the transport owner. `transport-telemetry.ts` is an instrumentation helper, not another client, queue, transport registry, database writer or canonical identity owner.

## Observed boundaries

- The actual proto-loader service definitions are wrapped before `grpc.loadPackageDefinition`: request protobuf serialization and response protobuf deserialization measure elapsed codec time and byte counts without serializing twice.
- Each request uses AsyncLocalStorage for isolated counters. Concurrent loopback calls with distinct request byte counts prove that observations do not merge into a global total.
- HTTP evidence/codebase paths measure `JSON.stringify` and `JSON.parse` separately. Body reading finishes before parsing is timed; network time is not reported as JSON parse time.
- Returned responses carry optional `transportTelemetry` with observation timestamp, operation, transport, codec counts/bytes/time, and `canonicalAuthority=false`. Relevant gRPC response mappers preserve this local observation.
- `rpc_transport` identifies the path actually used. gRPC uses grpc-js's HTTP/2 transport contract. HTTP fetch does not expose the negotiated HTTP version here, so `http_version` stays null. No QUIC or HTTP/3 claim is inferred from headers, names or configuration.
- Unexecuted codec stages remain null, not measured zero. Payloads, queries, vectors, hidden reasoning and source bytes are not included in the measurement metadata.

The retrieval proto imports `shared_ids.proto` from the repository proto root. The real client now supplies that root as a proto-loader include directory. Previously mocked client tests did not catch the missing import resolution; a real loopback server/client test did.

## Proof and limits

`retrieval-client.transport.spec.ts` runs the real retrieval proto, grpc-js client and HTTP client against temporary loopback fixture servers. It verifies concurrent protobuf encode/decode and actual HTTP JSON encode/decode. This does not contact or mutate PostgreSQL/Qdrant/Valkey, restart shared services, or establish production corpus/packet lineage.

With `ATLAS_TRANSPORT_WRITE_RECEIPT=1`, the test exclusively creates a timestamped `docs/reports/retrieval-transport-loopback-*.json` containing numerical observations only. Existing artifacts are preserved.

```powershell
cd sveltekit-frontend
$env:ATLAS_TRANSPORT_WRITE_RECEIPT='1'
npx vitest run src/lib/server/grpc/transport-telemetry.spec.ts src/lib/server/grpc/retrieval-client.transport.spec.ts src/lib/server/grpc/retrieval-client.test.ts --environment node --maxWorkers=1 --minWorkers=1
```

The older `atlas/go-retrieval-grpc-client.ts` is a separate existing adapter with an unimplemented proto client and an HTTP fallback. It is not evidence of this client's deployed gRPC execution. MessagePack also remains a separate codec with fixture coverage; it is not silently substituted for protobuf or HTTP JSON.

## Cache delivery versus origin observations

The five methods on `retrievalClient` retain `withRpcCache`'s existing hit decision. They now return a strict `deliveryTelemetry` observation with `source=L1_REDIS` or `COMPUTE_RETURN` and a current delivery timestamp. This is delivery provenance, not cache validity or source admission.

On a cache hit, historical network measurements move into `deliveryTelemetry.origin_transport_telemetry`; top-level `transportTelemetry` is omitted because no new transport codecs ran. On a compute return, a validated current transport observation remains available at top level as well. A compute return can be an unavailable-service default, so it does not itself prove an RPC occurred. Missing or malformed origin metadata stays null, never inferred from configured transport. Cached values are not mutated and cache keys/query text are not included in delivery metadata.

Tests replay the actual cache-envelope implementation against an injected in-memory store, verifying one compute followed by a cache hit without a second encode. Separate caller tests exercise all five existing cached methods, and existing ephemeral gRPC/HTTP loopback tests remain passing. No shared Redis service or production corpus is used.

## Failed attempt observations

`observeTransport` adds an optional `attempt_outcome` (`RETURNED`, `NO_RESULT`, `THREW`) and accepts a failure observer. Existing stored observations without that field remain readable; missing historical outcomes are not inferred. All four existing gRPC/HTTP call boundaries forward failed attempts through `recordFailedTransportAttempt` into the existing packet/eval writer. Successful calls retain their existing returned codec observation and do not emit duplicate failure events.

`NO_RESULT` means the caller returned null/undefined, including an existing caught HTTP/parse or gRPC error; it is not a claimed status-code or exception classification. `THREW` preserves an uncaught action exception unchanged. Failed codec calls retain their counts and measured durations. A successful empty result is `RETURNED`, not failure.

The structured failure payload contains only validated codec observations and the observed transport. It does not copy request text, credentials, response bytes or exception messages; packet/source/model identities remain unknown where the caller has no qualified context. Existing application console warnings are unchanged. The lazy existing-writer import is shared across concurrent attempts; observer/import/store errors never replace a retrieval result or block waiting for persistence. Delivery remains best effort, not a durable queue or guaranteed audit trail.

Real ephemeral loopback tests cover gRPC UNAVAILABLE through generic/evidence paths, HTTP 503 through both routes, and a JSON parse failure before null fallback. Unit tests cover thrown actions and pending/throwing observers. The database writer is mocked; no live durable readback is established.

Remaining gates: production endpoint replay and packet-qualified durable readback; negotiated HTTP version when observable; guaranteed/bounded failed-attempt delivery; live cache/origin reconciliation; and live per-operation GPU/Redis/Qdrant/Neo4j observations. Returned codec/delivery metadata is not a new durable telemetry sink. Source-revision writes and backfills remain deferred until the operator's post-P20 gates pass.
