Feedback & Protobuf / Codegen Summary — 2025-08-28

This file is an automated snapshot of recent changes and ongoing tasks related to the feedback → tensor pipeline, protobuf regeneration, and Go build triage.

Highlights
- Added `proto/feedback.proto` and generated Go bindings under `go-microservice/proto/feedback`.
- Implemented a small collector (`go-microservice/cmd/collector`) that marshals feedback proto messages and publishes to Redis/Postgres for replay.
- Added aggregation skeleton (`go-microservice/cmd/aggregator`) for batching to Qdrant and Postgres.
- Created repo-local deterministic proto regeneration tooling (`scripts/protoc-regenerate.ps1`) and cleanup helpers to avoid nested generated dirs.
- Regenerated many `.pb.go` files into per-package folders (e.g., `proto/aiserver`, `proto/vectorservice`) and started repo-wide build triage.
- Applied small compatibility shims to observability and auth to unblock builds.

Current blocking issues (next steps)
- `cmd/vector-consumer-v2` currently fails to compile due to proto field/accessor mismatches, cache API signature differences, and a few auth/logger callsite expectations. Ongoing edit set will update accessors (GetJobId/GetPoints), adjust cache calls to include namespace+TTL, and add small exported helpers in `internal/auth`.
- A third-party binary compatibility issue referencing `github.com/bytedance/sonic` remains; triage pending.

How to reproduce (local dev)
1. From repo root: `cd go-microservice`
2. Run the targeted build: `go build ./cmd/collector ./cmd/vector-consumer-v2`

If push fails due to large files the script will abort. No large or binary files were intentionally added by this change.

Commit created by automation on behalf of developer workflow.
