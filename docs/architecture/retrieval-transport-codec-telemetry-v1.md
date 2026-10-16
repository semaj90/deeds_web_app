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

Remaining gates: production endpoint replay and packet-qualified durable readback; negotiated HTTP version when observable; failure-attempt trace retention; cache-hit versus origin codec timings; and per-operation GPU/Redis/Qdrant/Neo4j observations. Returned codec metadata is not a new durable telemetry sink. Source-revision writes and backfills remain deferred until the operator's post-P20 gates pass.
