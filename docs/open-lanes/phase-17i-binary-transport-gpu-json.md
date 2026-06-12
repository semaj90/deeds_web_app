# Phase 17I: Binary Transport & GPU Structural Parsing

**Status**: READY / SPEC

**Purpose**

Measure transport pressure before adding binary RPC, GPU JSONPath, or structural parsing complexity. This lane is audit-only until the measured pressure justifies a transport upgrade.

**Primary audit**

- `npm run atlas:audit:transport-pressure`

**Audit outputs**

- `docs/reports/transport-pressure-audit.json`
- `docs/reports/transport-pressure-audit.md`

**What the audit reports**

- Largest JSON, NDJSON, and JSONL files
- Largest MessagePack chunks
- RabbitMQ availability
- NATS availability when configured
- TurboVec availability from the existing OpenCode routing config
- Current packet counts
- Estimated Node parse risk
- Recommended lane level

**Lane levels**

| Level | Meaning |
|---|---|
| `LEVEL_1_CPU_STREAMING` | Default. JSON/NDJSON parsing and bounded streaming are sufficient. |
| `LEVEL_2_BINARY_TRANSPORT` | RabbitMQ or NATS is active, or binary contract pressure justifies a bounded binary transport layer. |
| `LEVEL_3_GPU_STRUCTURAL` | Artifact volume or structural scan pressure is large enough that CPU streaming is no longer sufficient. |

**Do not build yet**

- gRPC service
- FlatBuffers schema
- CUDA JSONPath
- GpJSON runtime
- Arrow GPU pipeline

**Activation rule**

Use the audit result first. Only move beyond CPU streaming when the report shows the pressure threshold is real, not assumed.
