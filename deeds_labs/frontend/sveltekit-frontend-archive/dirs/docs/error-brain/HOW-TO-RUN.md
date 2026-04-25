# Error Brain: How to Run

## Overview

The Error Brain is an automated error fixing system with hash-guarded patches, deterministic reporting, and hard safety caps.

## Quick Start

### 1. Enable Error Brain

```bash
export ERROR_BRAIN_ENABLED=1
export ERROR_BRAIN_TRANSPORT=sse
export ERROR_BRAIN_APPLY_MODE=safe
```

### 2. Start a Run

```bash
curl -X POST http://localhost:5173/api/internal/error-brain/run
```

Response:
```json
{
  "runId": "rb_20251215_191015_a3f2",
  "createdAt": 1734289815000,
  "step": "queued",
  "pct": 0
}
```

### 3. Check Status

```bash
curl http://localhost:5173/api/internal/error-brain/status/rb_20251215_191015_a3f2
```

### 4. Stream Events (SSE)

```bash
curl -N http://localhost:5173/api/internal/error-brain/stream
```

## Apply Modes

### `off` (default)
- Patches are generated but never applied
- Safe for CI and analysis

### `safe`
- Only applies patches with confidence >= 0.95
- Respects all guardrails
- Recommended for automated runs

### `full`
- Applies patches with confidence >= 0.7
- Still respects hash guards and line limits
- Use only with human oversight

## Configuration

All configuration via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `ERROR_BRAIN_ENABLED` | `0` | Enable/disable system |
| `ERROR_BRAIN_TRANSPORT` | `none` | Transport: `none`, `sse`, `redis`, `both` |
| `ERROR_BRAIN_APPLY_MODE` | `off` | Apply mode: `off`, `safe`, `full` |
| `ERROR_BRAIN_MAX_PATCH_LINES` | `80` | Max lines changed per patch |
| `ERROR_BRAIN_MAX_PATCHES_PER_RUN` | `100` | Max patches per run |
| `ERROR_BRAIN_CONFIDENCE_SAFE` | `0.95` | Confidence threshold for safe mode |
| `ERROR_BRAIN_CONFIDENCE_FULL` | `0.7` | Confidence threshold for full mode |
| `BATCH_REPORT_STAMP` | auto | Deterministic report timestamp |

## Output Locations

- **Run state**: `reports/runs/<runId>.json`
- **Patches**: `reports/patches/<stamp>/<runId>/`
- **Apply logs**: `reports/patches/<stamp>/<runId>/apply-log.json`
- **Incidents**: `reports/incidents/<incidentId>.md`

## Dry Run

```bash
# Set apply mode to 'off'
export ERROR_BRAIN_APPLY_MODE=off

# Run analysis
curl -X POST http://localhost:5173/api/internal/error-brain/run

# Check proposed patches
cat reports/patches/*/rb_*/apply-log.json
```

## Example Workflow

```bash
# 1. Freeze timestamp
export BATCH_REPORT_STAMP=$(date +%Y-%m-%d_%H-%M-%S)

# 2. Enable in safe mode
export ERROR_BRAIN_ENABLED=1
export ERROR_BRAIN_APPLY_MODE=safe

# 3. Start run
RUNID=$(curl -X POST http://localhost:5173/api/internal/error-brain/run | jq -r .runId)

# 4. Watch progress
curl -N http://localhost:5173/api/internal/error-brain/stream

# 5. Review results
cat reports/runs/${RUNID}.json
cat reports/patches/${BATCH_REPORT_STAMP}/${RUNID}/apply-log.json
```

## Troubleshooting

### Run not starting
- Check `ERROR_BRAIN_ENABLED=1`
- Verify `reports/` directory is writable

### Patches not applying
- Check apply mode: `ERROR_BRAIN_APPLY_MODE`
- Review `apply-log.json` for rejection reasons
- Common rejections:
  - Hash mismatch (file changed)
  - Line delta exceeded
  - Confidence below threshold

### Stream not connecting
- Verify `ERROR_BRAIN_TRANSPORT` includes `sse`
- Check for CORS issues
- Streams auto-close after 5 minutes
