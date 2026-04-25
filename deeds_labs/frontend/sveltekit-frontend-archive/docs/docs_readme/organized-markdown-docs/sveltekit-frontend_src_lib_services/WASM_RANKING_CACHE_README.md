# WASM Ranking Cache Client

Client-side WebWorker + optional WASM accelerated adapter for the single-character ranking cache served over QUIC.

## Features
- Packs/Unpacks ranking blobs mirroring server bit-packed format (JS fallback)
- WebWorker isolation for non-blocking UI
- CRC32 integrity verification on unpack
- Fetch raw or JSON meta via `/quic/rankings/:key`
- Pluggable endpoint & future WASM module binding (`wasmUrl`)

## Usage
```ts
import { wasmRankingCacheService } from './wasm-ranking-cache-service';
await wasmRankingCacheService.init();
const meta = await wasmRankingCacheService.fetchJsonMeta('A');
const raw = await wasmRankingCacheService.fetchRaw('A');
const decoded = await wasmRankingCacheService.unpack(raw.buffer);
```

## Next Steps
- Implement actual Rust/AssemblyScript module exposing pack/unpack
- Shared schema/IDL generation for both Go & TS
- Add unit tests covering pack→unpack roundtrip & CRC corruption detection
