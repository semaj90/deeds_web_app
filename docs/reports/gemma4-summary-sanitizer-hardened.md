# Gemma4 Summary Sanitizer Hardened Report

- Timestamp: 2026-07-04T00:58:23.626Z
- DB sample size: 200
- Synthetic cases: 4
- Gate: PASS

## Synthetic Cases

| Case | Safe | Usable | Changed | Raw Leak | Leak After | Summary |
|---|---:|---:|---:|---:|---:|---|
| transport markers | yes | yes | yes | yes | no | This module creates a shallow copy of the input object. |
| channel thought block | yes | no | yes | yes | no | This module validates packets. |
| space-delimited turn markers | yes | yes | yes | yes | no | Packet summary should remain after stripping markers. |
| meta preamble and whitespace | yes | yes | yes | no | no | This module builds an ACE packet envelope. |

## Live Sample

- Safe after sanitize: 200
- Usable after sanitize: 183
- Changed: 38
- Leaky after sanitize: 0
- Markers before: {"channel":0,"turns":0,"bos":0,"eos":0,"thought":0}
- Markers after: {"channel":0,"turns":0,"bos":0,"eos":0,"thought":0}

## Gaps

- None detected in this run.
