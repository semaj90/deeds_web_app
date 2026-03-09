# xjson Abstraction

Build-tag driven JSON abstraction.

Default (no tag): wraps encoding/json.
Optional tag `jsonv2`: wraps experimental github.com/go-json-experiment/json.

Hot paths may still use specialized libs (e.g. sonic) directly.

When a sonic fast-path parse fails, the service falls back to xjson (stdlib or json/v2) and increments the Prometheus counter `sonic_parse_fallback_total`. Monitor this to detect data anomalies or performance regressions.

## Usage

Import alias:

```go
import json "legal-ai-cuda/internal/xjson"
```

Marshal / Unmarshal:

```go
b, _ := json.Marshal(v)
_ = json.Unmarshal(b, &out)
```

## Enable experimental json/v2

```bash
go build -tags jsonv2 ./...
```

When building a specific tagged service (e.g. the cognitive microservice):

```bash
# Standard (stable stdlib JSON)
go build -tags cognitive -o cognitive-service ./cognitive-microservice.go

# Experimental (json/v2)
go build -tags "cognitive jsonv2" -o cognitive-service ./cognitive-microservice.go
```

## Make targets (to be added)
- `make build` standard
- `make build-jsonv2` experimental

If present, these wrap the above commands (the experimental one appends `jsonv2` to TAGS).

## Rationale
- Swap underlying implementation without touching call sites.
- Allow progressive rollout / benchmarking.
- Keep fallback to stdlib for stability.

## Benchmark idea
`go test -bench=. -run=^$ ./internal/xjson/bench` (see added bench file).

## Notes
- Streaming Decoder/Encoder intentionally omitted for experimental path to avoid churn.
- Do not import both xjson and encoding/json in same file unless necessary.
- Metric emitted by cognitive microservice for fallbacks: `sonic_parse_fallback_total` (counter).
- A spike in fallback count implies malformed JSON input or an incompatibility between sonic and the current Go version / data shape.

## Verification Checklist
- Build (stable): `go build -tags cognitive ./cognitive-microservice.go`
- Build (experimental): `go build -tags "cognitive jsonv2" ./cognitive-microservice.go`
- Run: `./cognitive-service` then curl `/metrics` and ensure `sonic_parse_fallback_total` is present (should start at 0).
- Optional bench: `go test -run=^$ -bench . ./internal/xjson -count=1`.
