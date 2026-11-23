# DOC-14 DSPy native repair worker wiring

**Status: PARTIAL — source wiring and contract tests pass; running-container inference is unverified.**

## Change

- The repair worker now discovers available model IDs from `DSPY_LM_API_BASE` (defaulting to the local OpenAI-compatible endpoint), verifies an optional `DSPY_LM_MODEL` override against that live list, and constructs DSPy with `engine="lm15"` to fail closed instead of falling back to LiteLLM.
- Model discovery is lazy inside `RepairProgramV1.forward`; `/health` remains model-free.
- Both repair `Predict` calls run in an explicit JSONAdapter context.
- Removed the stale `ornith-1.5-9b` default from the worker Dockerfile. The container still needs an operator-controlled rebuild/reload to consume the Dockerfile change.

## Evidence

- Workspace HEAD at review: `4fe5ebf63e07d57bcfc3f002c3537215d5011f79`; these edits are working-tree changes.
- `python/parent_atlas_dspy_repair.py` SHA-256: `78c9f77ca18dbcabd6c3bc5b7a228d34d35fe76363d0464dab458e9da253fab4`.
- Focused WSL2 command: `wsl.exe -d Ubuntu -- /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python -m pytest /mnt/c/Users/james/Videos/deeds-web-app/python/tests/test_parent_atlas_dspy_repair.py -q`.
- Exact result at the original review: `70 passed in 2.29s`.
- Follow-up Windows Python 3.13 run: worker and ACE adapter suites passed `75 passed in 3.61s`. Added coverage verifies the repair module resolves its LM lazily and runs both `Predict` calls inside the explicit native `lm15` + JSONAdapter context.
- Follow-up WSL2 `atlas-rapids-cu13` run: `python/tests/test_parent_atlas_dspy_repair.py` passed `71 passed in 3.52s`.
- These tests exercise resolver and module wiring with fakes; they do not call a model.
- `openspec validate parent-atlas-versioned-doc-intelligence --strict`: valid.
- `git diff --check` on the four changed paths: exit 0; Git reported only CRLF conversion notices.
- `node scripts/atlas/gan-validation-hook.mjs`: `PASS`, census `349` total / `69` done / `62` partial / `218` open; the hook is an advisory census, not DOC-14 completion evidence.

## Not proven

- The user-reported running container (`atlas-dspy-repair-worker:local`, ID `ef62bc05cbd8`) was not inspected or rebuilt. Docker operations are operator-only under the repository instructions.
- A read-only `GET http://127.0.0.1:8122/health` returned connection refused during follow-up, so there is no reachable worker process to test at this address now.
- The lockfile still pins DSPy `3.4.1` and LiteLLM `1.105.1`; no dependency lock regeneration was done.
- No live `/v1/models` call, actual native `lm15` request/response, or real `/v1/repair` call was made. No ACE, ontology, database, graph, or cache writes occurred.
- No OpenSpec checkbox was changed. Actual claim grounding, source admission, reviewed relation admission, GEPA optimization, and learning promotion remain open.
