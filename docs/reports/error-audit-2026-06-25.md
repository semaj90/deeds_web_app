# P1.1: Error Audit Report

**Date**: 2026-06-25T15:23:27.787Z
**Status**: ✅ PASS

## Summary

- Total errors: 6
- Categories: 1
- Severity levels: 1
- Date range: Tue Jun 16 2026 11:12:58 GMT-0700 (Pacific Daylight Time) → Sun Jun 21 2026 21:03:36 GMT-0700 (Pacific Daylight Time)

## Errors by Category

| Category | Count | % |
|----------|-------|---|
| inference_error | 6 | 100.0% |

## Errors by Severity

| Severity | Count | % |
|----------|-------|---|
| WARNING | 6 | 100.0% |

## Sample Errors (Latest 100)


### 1. inference_error (WARNING)
```
EmbeddingGenerationError: All embedding tiers failed
```
*Context*: embed
*Time*: Sun Jun 21 2026 21:03:36 GMT-0700 (Pacific Daylight Time)


### 2. inference_error (WARNING)
```
EmbeddingGenerationError: All embedding tiers failed
```
*Context*: embed
*Time*: Fri Jun 19 2026 10:24:11 GMT-0700 (Pacific Daylight Time)


### 3. inference_error (WARNING)
```
EmbeddingGenerationError: All embedding tiers failed
```
*Context*: embed
*Time*: Wed Jun 17 2026 08:00:33 GMT-0700 (Pacific Daylight Time)


### 4. inference_error (WARNING)
```
EmbeddingGenerationError: All embedding tiers failed
```
*Context*: embed
*Time*: Wed Jun 17 2026 06:49:39 GMT-0700 (Pacific Daylight Time)


### 5. inference_error (WARNING)
```
EmbeddingGenerationError: All embedding tiers failed
```
*Context*: embed
*Time*: Wed Jun 17 2026 06:46:43 GMT-0700 (Pacific Daylight Time)


### 6. inference_error (WARNING)
```
EmbeddingGenerationError: All embedding tiers failed
```
*Context*: embed
*Time*: Tue Jun 16 2026 11:12:58 GMT-0700 (Pacific Daylight Time)


## Next Steps

1. Run P1.2 (error plan) to generate fix recommendations
2. Review top categories and severity distribution
3. Plan P1.3 (error apply) based on audit findings
4. Implement targeted error fixes per category
