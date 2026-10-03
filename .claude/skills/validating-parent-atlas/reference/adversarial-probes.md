# Adversarial probes

A probe passes only if the malicious fixture is rejected with EXACTLY the expected code AND its benign control is accepted. Source: `scripts/atlas/lib/gan-modern-probes-v1.mts`; runner: `scripts/atlas/prove-gan-adversarial-v1.mts`.

Historical (meanings never change; executed against the real atlas-core validators):

| ID | Lane | Rejects |
|---|---|---|
| ADV001 | authority | missing `packet_key` |
| ADV002 | authority | malformed `source_ref` |
| ADV003 | semantic | SQL on a fake/unknown table |
| ADV004 | semantic | placeholder terms (`fake_`, `??`, `TODO`) |
| ADV005 | runtime | Redis before Postgres |
| ADV006 | runtime | NATS before Postgres |

Modern:

| ID | Lane | Rejects | Owner |
|---|---|---|---|
| ADV007 | authority | `packet_id` treated as canonical identity | `resolveCanonicalIdentityV2` |
| ADV008 | authority | artifact chosen by latest timestamp / glob sort | `detectImplicitLatestSelectionV1` (heuristic; repo-wide sweep is IDENTITY-POLICY-REPO-01) |
| ADV009 | authority | CandidateOrdinalMap checksum mismatch | `assertCandidateOrdinalMapIntegrityV1` |
| ADV010 | structural | packet-qualified evidence used by a CHUNK-grain feature | `qualifyEvidenceV1` + `satisfiesEvidenceEligibilityV1` |
| ADV011 | structural | `source_revision` mismatch | `qualifyEvidenceV1` |
| ADV012 | structural | `workspace_revision` mismatch | `qualifyEvidenceV1` |
| ADV013 | authority | Qdrant point id equal to canonical id | `assertExecutorIdIsNotCanonicalIdentity` |
| ADV014 | authority | unqualified `content_hash` promoted to exact identity | `resolveCanonicalIdentityV2` |
| ADV015 | runtime | BitFrost entry reused across a coordinate mismatch | `buildAceBitfrostCacheKeyV1` |
| ADV016 | structural | blocked candidate-feature admission producing a ContextManifest | `admitCurrentAceContextManifestV1` (no benign control here; admitted path is covered by its own spec) |

Known measured gaps of the historical validators (reported, never counted as passes): the `source_ref` rule falsely rejects legitimate refs (`.svelte`, `.mts`, `.py`, bracketed routes, capitals) and accepts a path-traversal string; ADV003 only matches `fake_|unknown_|temp_` so a genuinely nonexistent table name is accepted.

Adding a probe: give it a malicious fixture, an expected code, and a control; assign one lane; do not rename or reinterpret an existing ID.
