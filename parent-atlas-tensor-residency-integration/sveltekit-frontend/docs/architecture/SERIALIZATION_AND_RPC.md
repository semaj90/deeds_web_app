# Serialization and RPC

## Control path

Small request/config objects use JSON and may use the existing native simdjson addon when healthy. The adapter must reject/fallback if the native function returns the original JSON string rather than a parsed value.

## Bulk path

Arrow IPC owns large numeric data. Avoid base64/hex for tensors. MessagePack is optional for compact dynamic control messages; Protobuf/gRPC is optional when a strongly typed remote boundary is justified.

## QUIC-style assembly

QUIC is used only as an analogy: asynchronous pass/chunk completion may arrive out of order; the assembler uses request/packet identity, revision tuple, idempotency key, and sequence number only when chunk ordering is meaningful.

## SharedArrayBuffer / CPU workers

Use up to four CPU workers for CPU-bound staging work. SharedArrayBuffer/Atomics are coordination primitives, not persistent storage. Arrow remains the artifact format.
