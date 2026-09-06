# Design notes — parent-atlas-tensor-residency-integration

Reference/rationale material moved out of `specs/` on 2026-09-04 so `specs/` holds only
OpenSpec delta requirements (per `openspec validate --strict`'s own guidance: "move non-delta
notes outside specs/"). Content preserved verbatim, not summarized away. The normative
requirements this material supports now live in `specs/packet-assembly/spec.md` and
`specs/tensor-residency/spec.md`.

## Packet assembly: supporting vector-selection slice

The newer Atlas vector-selection slice sits underneath the packet assembler as a supporting
layer only. It is wired into the packet consumer result as an additive feature matrix and does
not alter assembly ownership. It adds:

- `src/lib/server/atlas/vector/ace-packet-vector.ts`
- `src/lib/server/atlas/vector/turbovec-interpolation.ts`
- `src/lib/server/atlas/ranking/packet-feature-matrix.ts`

ACE compatibility re-exports remain in place, but the canonical owner for the vector slice is
now `src/lib/server/atlas/`.

## Packet assembly: serialization policy

- JSON + simdjson/JSON parser: small control messages.
- MessagePack: optional compact dynamic control messages.
- Protobuf/gRPC: optional typed process boundary.
- Arrow IPC: bulk columnar/tensor artifacts.
- Base64/hex: debug/text-boundary encodings only.

## Packet assembly: QUIC analogy

The assembler borrows QUIC's principle that transport arrival may be unordered while logical
identity/order remain explicit. This specification does not require a QUIC transport migration.
