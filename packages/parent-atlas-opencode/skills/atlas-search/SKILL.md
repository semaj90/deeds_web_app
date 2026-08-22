# Atlas Search Skill

Search the Parent Atlas codebase using GPU-accelerated retrieval.

## Usage

```
@atlas search "query text"
```

## Examples

- `@atlas search "authentication flow"`
- `@atlas search "GPU memory management" --confidence 0.8`
- `@atlas search "bifrost cache hit" --top-k 10`

## Parameters

- `query` (required): Search text
- `--confidence`: Minimum confidence threshold (0.0-1.0, default: 0.6)
- `--top-k`: Number of results to return (default: 5)
- `--gpu`: Use GPU acceleration (default: true)
- `--prefilter`: Enable TurboVec prefiltering (default: true)

## Description

The Atlas Search skill queries the semantic cache (Bifrost L1/L2), performs SOM-aware prefiltering via TurboVec, and reranks results using a 4-signal GPU blend (semantic 0.45 + topology 0.30 + latent 0.15 + glyph 0.10).

Typical latency:
- L1 exact match: 5ms
- L2 semantic hit: 2-5s
- L3 cold inference: 25-30s

Returns: relevance score, embedding dimensions, source file, function symbol, confidence badge.
