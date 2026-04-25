# Go Binary Cleanup - September 11, 2025

All Windows/Go executables are now globally ignored via `.gitignore` patterns (`*.exe`).
If a specific binary needs tracking, add an explicit negation rule near the end of `.gitignore` with justification.

Checklist:
- [x] Confirmed `.gitignore` has global `*.exe` ignore.
- [x] No new executable patterns need whitelisting.
- [ ] (Optional) Purge historical large binaries from git history using `git filter-repo` (not yet run).

Next Steps (optional):
1. Run size audit: `git count-objects -vH`.
2. If large pack files remain from old binaries, perform history rewrite.
3. Tag post-clean commit: `git tag cleanup-go-binaries-20250911`.
Go Build Tag Cleanup — summary (gobinaries911)

Overview

This document records the build-tag, placeholder, and module changes I applied to the `organized-files/go-source/go-microservice` package to resolve conflicting declarations and to make SIMD/CUDA implementations opt-in.

File → Build Tag changes (applied)

- `organized-files/go-source/go-microservice/som-clustering-fixed.go` : `experimental`
- `organized-files/go-source/go-microservice/neo4j-simd-worker-safe.go` : `legacy`
- `organized-files/go-source/go-microservice/gemma3-legal-gpu-server.go` : `legacy`
- `organized-files/go-source/go-microservice/neo4j-tricubic-search.go` : `experimental`
- `organized-files/go-source/go-microservice/quic-server.go` : `experimental`
- `organized-files/go-source/go-microservice/som-clustering.go` : `experimental`
- `organized-files/go-source/go-microservice/redis-test.go` : `experimental`
- `organized-files/go-source/go-microservice/gpu-legal-ai-server.go` : `legacy`

Policy used

- Files with `_simd` in their filename were set to `//go:build simd` earlier in the process.
- Files with `_cuda` in filename are built with `//go:build cuda` when present.
- Experimental/alternate implementations were moved behind `//go:build experimental` so they are not built by default.
- Legacy safe or OS-specific files were placed behind `//go:build legacy` when appropriate.
- Files known to be intentionally excluded were given `//go:build ignore`.

How to build

- Build the default (embedder) service (this will compile `search-embedder-service.go` as main):

```powershell
cd C:\Users\james\Videos\deeds-web-app\organized-files\go-source\go-microservice
go build .
```

- Build with experimental services enabled:

```powershell
go build -tags=experimental .
```

- Build SIMD variant (requires a C toolchain and CGO enabled):

```powershell
# Windows example with clang and environment prepared
setx CGO_ENABLED 1
go build -tags=simd .
```

- Build CUDA variant (requires CUDA toolkit installed and configured):

```powershell
go build -tags=cuda .
```

Notes and caveats

- I replaced several empty/truncated files with minimal placeholder content to avoid parse errors. If you prefer those to be restored to their original contents, revert those files from your VCS or tell me which to restore.
- The microservice `go.mod` was adjusted to `module legal-ai-cuda/organized-files/go-source/go-microservice` and still has a `replace legal-ai-cuda => ../../..` mapping for local development. If you want a different module layout, say so.
- After these changes, `go build` in the microservice directory succeeds and compiles the `search-embedder-service` binary by default.

If you want, I can:
- Produce a more detailed per-file change log (diffs), or
- Revert tag changes for specific files, or
- Start the embedder service locally now and show logs.

