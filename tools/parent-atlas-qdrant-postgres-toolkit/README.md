# Parent Atlas Qdrant / PostgreSQL 18 Toolkit

Read-only helpers for:

- Qdrant REST collection metadata and point scrolling
- Qdrant gRPC connectivity through `grpcurl`
- PostgreSQL 18 JSON/JSONB column and index inventory
- Drizzle ORM read-only JSON-column query
- PyTorch tensor scoring with explicit packet-key row manifests

## Install

Copy these folders into the repository root:

```text
scripts/qdrant/
scripts/postgres/
scripts/gpu/
scripts/ops/
sql/
```

## Environment

Load the existing ignored PostgreSQL secret into the current process:

```powershell
$env:PGPASSWORD = "<existing ignored secret>"
$env:PGHOST = "127.0.0.1"
$env:PGPORT = "5434"
$env:PGDATABASE = "legal_ai_db"
$env:PGUSER = "legal_admin"
```

## Qdrant REST audit

```powershell
$env:QDRANT_URL = "http://127.0.0.1:6333"
$env:QDRANT_COLLECTION = "codebase_chunks_768"
node .\scripts\qdrant\qdrant-rest-audit.mjs
```

It uses the official collection-info and point-scroll API shape. It does not
request vectors or mutate payloads.

## Qdrant gRPC helper

Qdrant normally exposes gRPC on port `6334`. The helper uses `grpcurl`.

Reflection probe:

```powershell
.\scripts\qdrant\qdrant-grpc-helper.ps1 -ListOnly
```

Descriptor-based invocation when reflection is unavailable:

```powershell
.\scripts\qdrant\qdrant-grpc-helper.ps1 `
  -ProtoRoot C:\path\to\official-qdrant-protos `
  -ProtoFile qdrant.proto `
  -Service "qdrant.Collections/List"
```

Use exact service names from the official Qdrant protobuf definitions present
in your checked-out version.

## PostgreSQL 18 JSON/index audit

```powershell
.\scripts\postgres\run-postgres18-json-audit.ps1
```

The SQL runs inside `BEGIN TRANSACTION READ ONLY` and sorts output
deterministically by schema, table, and column/index name.

## Drizzle ORM helper

Requires the repository's existing packages:

```text
drizzle-orm
pg
tsx
dotenv
```

Run:

```powershell
npx tsx .\scripts\postgres\drizzle-json-index-audit.ts
```

## PyTorch row-manifest scorer

Input:

```json
{"packet_key":"packet:abc","features":[0.1,0.2,0.3]}
{"packet_key":"packet:def","features":[0.4,0.5,0.6]}
```

Run:

```powershell
Get-Content .\fixtures\feature-rows.jsonl |
  python .\scripts\gpu\pytorch-manifest-score.py --device cuda
```

The scorer requires explicit `packet_key` per row and rejects duplicate keys,
non-finite values, and inconsistent feature widths. It does not infer identity
from tensor order.

## Combined read-only run

```powershell
.\scripts\ops\run-readonly-audits.ps1
```
