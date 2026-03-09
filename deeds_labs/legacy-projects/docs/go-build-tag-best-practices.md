# Go Build Tag Best Practices (Default vs Legacy)

This repo uses a dual-build workflow:

- Default build: clean, active code only
- Legacy build: optional/experimental code, compiled with `-tags=legacy`

## Goals

- Keep `main` green and fast by default
- Preserve historical/experimental code without breaking builds
- Make the legacy path explicit and opt‑in

## Structure

- Module lives in `go-microservice/` (single module)
- Active code: `go-microservice/service` (library) and `go-microservice/cmd/...` (entrypoints)
- Legacy/experimental code: anywhere outside `service/` and `cmd/`, tagged with:
  ```go
  //go:build legacy
  // +build legacy
  ```
- Recommendation: Over time, consolidate legacy under dedicated dirs like `go-microservice/legacy`, `go-microservice/experiments` to make boundaries obvious.

## Build commands

- Default (excludes legacy):
  ```bash
  cd go-microservice
  go build ./...
  ```
- Legacy (includes legacy):
  ```bash
  cd go-microservice
  go build -tags=legacy ./...
  ```

## Tagging automation

- Script: `scripts/tag-legacy-go-files.mjs`
  - Skips `service/` and `cmd/` by default
  - Skips `_test.go`
  - Preserves newlines
  - Rewrites existing build constraints to `legacy`
- Allowlist mode (safer):

  ```bash
  # Only tag within the listed top-level dirs under go-microservice
  node scripts/tag-legacy-go-files.mjs --allowlist=legacy,experiments,benchmarks

  # or
  ALLOWLIST_DIRS=legacy,experiments,benchmarks node scripts/tag-legacy-go-files.mjs
  ```

- VS Code task: “Tag Legacy Go Files” (Terminal → Run Task…)
- npm script: `npm run tag:legacy-go`

## CI recommendations

- Default on PRs: build only the default path (excludes legacy)
  - `.github/workflows/go-build.yml` runs `go build ./...` in `go-microservice/`
- Optional: schedule a weekly legacy build
  ```yaml
  name: Go Legacy Build (weekly)
  on:
    schedule:
      - cron: "0 3 * * 1" # Mondays at 03:00 UTC
    workflow_dispatch: {}
  jobs:
    build-legacy:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-go@v5
          with: { go-version: "1.22.x" }
        - name: Build with legacy
          working-directory: go-microservice
          run: |
            go mod tidy
            go build -tags=legacy ./...
  ```
  Note: Legacy may require optional dependencies. Keep this scheduled job allowed to fail or maintained separately.

## Best practices

1. Clarity first in default path

- Prefer explicit code over deep abstraction
- Keep interfaces out of hot loops unless necessary
- Avoid reflection where possible

2. Tag discipline

- Group tagged code; avoid scattering per-package
- Keep tagged files out of `service/` and `cmd/`

3. Performance

- Build tags are compile-time only; they don’t affect runtime
- Real bottlenecks: allocations, unnecessary copying, reflection, interface dispatch in tight loops
- Use `pprof`, `benchmarks`, and real data to tune

4. Onboarding & docs

- Document default vs legacy commands in `README.md`
- Consider adding `go:generate` notes if legacy involves codegen

## Troubleshooting

- Legacy build fails due to missing modules

  - Add optional deps only if you intend to support legacy builds:
    ```bash
    # example only
    go get github.com/prometheus/client_golang/prometheus
    go get google.golang.org/grpc
    ```
  - Or keep CI focused on the default build and run legacy builds ad-hoc

- Symbol collisions in default path
  - Ensure duplicates live outside `service/`/`cmd/` and are tagged as `legacy`

## Migration tips

- Promote code from legacy → service once stable
- Remove tags and move files under `service/`/`cmd/`
- Keep commits small and focused

---

Maintainer note: The default path must stay green. Legacy is opt‑in and can evolve independently without blocking CI.
