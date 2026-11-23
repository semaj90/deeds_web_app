# Case scene fetch parameters v1 · 2026-11-20

## What changed

- New case intake already collected WHO/WHAT/WHEN/WHERE/WHY/HOW, but saved them only as prose in `cases.description`. The standard new-case action now also writes a versioned `caseSceneIntakeV1` JSONB object with `USER_INTAKE_UNVERIFIED` status. Intake text seeds context, never scene facts.
- Added a shared Zod contract and browser-safe same-origin fetch-request builder for `/api/cases/{caseId}/scene-reconstruction/parameters`.
- Added a read-only, authorized POST endpoint. It checks the case through `getAuthorizedCase`, compares the expected scene revision using the existing scene revision reader, and verifies each selected evidence UUID belongs to the authorized case. It does not create a job or persist a scene.
- The request carries pseudonymous actor handles; event descriptions marked hypothesis/disputed; why/how as hypothesis, disputed, or unknown; source-specific clock lanes and uncertainty; selected evidence IDs; environment type; and cell size.
- The response contains a deterministic request hash and the unverified case-intake context, plus source membership. It explicitly reports `revisionVerified: false` because this endpoint does not read or hash original source bytes. It does not infer IDs, align clocks, or treat freeform WHY as a supported motive.
- Updated case-intake wording to describe allegations and observations provisionally and leave motive unknown when unsupported.

## Verification

- `npx vitest run src/lib/server/reconstruction/case-scene-fetch-parameters-v1.spec.ts`: 4 tests passed, covering deterministic parameters, unknown motive, evidence-reference constraints, membership mismatch, same-origin POST setup, and blockout-first requests without evidence.
- No database or object-store rows were written. No generation service or durable worker was called.
- The route has not been exercised against a signed-in browser or live PostgreSQL, and the case scene wizard has not yet been wired to call it.

## Remaining

Read reviewed observation revisions and media hashes through their canonical owners before any generator execution; connect the case workspace UI; add the existing durable job/worker handoff; and prove save/reopen independently. Do not use the legacy generic timeline summary as the authoritative WHY/HOW source: it currently derives prose from timeline activity and may supply generic fallback text.
