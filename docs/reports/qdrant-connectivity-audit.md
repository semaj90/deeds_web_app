# Qdrant Connectivity Audit

**Timestamp**: 2026-06-14T23:33:20.097Z
**Status**: WARN
**Transport Recommendation**: gRPC

## Configuration

- REST: http://127.0.0.1:6333
- gRPC: 127.0.0.1:6334

## Results

### REST (http://127.0.0.1:6333)
❌ **FAIL**
- Error: Failed to parse JSON response

### gRPC (127.0.0.1:6334)
✅ **WORKS**
- Port is reachable

### Collection Details
⚠️ Could not fetch details

## Recommendation

**Use Transport**: `gRPC`

**Reason**: REST endpoint unreachable, but gRPC (6334) works

**Action**: Set QDRANT_TRANSPORT=grpc in env

## Environment Variables

```bash
QDRANT_GRPC_HOST=127.0.0.1\nQDRANT_GRPC_PORT=6334\nQDRANT_TRANSPORT=grpc
```



