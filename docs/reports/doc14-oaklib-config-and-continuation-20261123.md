# DOC-14 OAKLib configuration and continuation

**Date:** 2026-11-23  
**Scope:** Configure the existing :8095 OAK label-search adapter and refresh the remaining DOC-14 handoff gates.  
**Canonical writes:** none.

## OAK source configured in Compose

Updated `docker/miniforge-nlp-sidecar/docker-compose.yml` to pass:

- `ATLAS_OAKLIB_ONTOLOGY_ROOT=/workspace/.okf/ontologies`
- `ATLAS_OAKLIB_ONTOLOGY_FILE=atlas-domain-and-language-terms-v1.obo`

The existing Compose mount exposes the repository at `/workspace:ro`, so this is the pinned local read-only OBO source. It contains 110 `[Term]` entries and 3 `[Typedef]` entries. Its SHA-256 is `8e651ef5bd4d0f8c702a7dd751687bf912fdbe470f198ae6e41b5248517cb14c`.

`docker compose -f docker/miniforge-nlp-sidecar/docker-compose.yml config --quiet` passed. Local Windows Python 3.13 with OAKLib 0.7.4 read the exact OBO and returned the expected proposal-only IDs for four labels: `NVIDIA CUDA Platform → ATLASPLAT:cuda`, `CUDA C++ → ATLASLANG:cuda_cpp`, `NVIDIA RTX GPU → ATLASHW:rtx_gpu`, and `PTX Virtual ISA → ATLASISA:ptx`. The response had `canonicalAuthority=false`; no write occurred. Focused sidecar/review tests passed: 28 passed, 4 dependency deprecation warnings.

The running :8095 endpoint still returns HTTP 503 `OAKLIB_SOURCE_NOT_CONFIGURED`, so it has not loaded the new Compose environment. Docker and sidecar lifecycle are operator-controlled; no container was restarted. Therefore local OAK proof is **PROVEN for the file/adapter**, while live HTTP OAK search remains **PARTIAL / pending operator activation**.

## Remaining end-to-end gates

1. Activate the updated sidecar configuration using the operator-controlled service procedure and verify live `/ontology/oaklib/search` returns the same pinned ontology revision and proposal-only IDs.
2. Re-run the existing source-bound relation proposal/review flow against a current captured source. OAK candidate IDs remain suggestions; a human must review the subject/object/predicate mapping before any graph admission.
3. Continue the PG18→Arrow replay only after a current authorized candidate cohort is available. The corrected read-only audit found 15/15 exact source-ref/chunk-hash rows and 15/15 `PROVEN` packet-lineage identities. The ordinal map's `identityAuthority=false` is intentional; it is not a canonical authority object. However, none of the candidates matches the workspace revision requested by the map, and chunk-row source/workspace revisions, producer metadata, and representation revisions are absent or mismatched (0/15); therefore the cohort remains blocked. The old `--live-pg` path was disabled because it synthesized provenance and a fixed score.
4. Fresh read-only `node scripts/atlas/audit-current-structural-edge-contract-v1.mjs` returned `CONTRACT_INCOMPLETE`, 0 nodes, 0 edges, and `graphRevision=null`. It updated only the diagnostic report; no graph rows were created.
5. Keep graph admission, ACE ContextManifest readback, DSPy citation support, and authorized Valkey publication separate. No one successful OAK lookup closes those gates.

## Corrected candidate-lineage readback

The initial audit treated `CandidateOrdinalMapV1.identityAuthority=false` as a failed authority check. That is the schema's intended value: an ordinal map is a derived coordinate map. The corrected audit independently joined each selected chunk row to its exact `PROVEN` `atlas_packet_chunk_lineage` row and the existing `atlas_workspace_source_bindings` records. It found 15 exact chunk/hash matches, 15 matching packet/source-revision lineage rows, and 60 source-binding rows across four workspace revisions per packet; the requested workspace revision matched 0/60 bindings. The chunk table's own source/workspace revision, producer, and representation columns are also missing or mismatched for all 15. This keeps the real blocker precise: stale workspace/candidate binding and incomplete denormalized vector provenance, not the ordinal map's non-authoritative flag. Report: `.tmp/atlas/lineage-semantic-768-cohort-live-refresh-v5-20261123.json`.

## OAK iterator/API alignment check

The local adapter calls OAK `SearchInterface.basic_search()` as an iterator, passes a per-term `SearchConfiguration.limit`, and independently caps consumed results with `islice` before deterministic candidate selection. It does not materialize an unbounded search result. The existing OAK label/definition reads are per selected candidate; that is acceptable for the pinned local OBO/Pronto source and the bounded candidate count, but a future remote OAK backend should use the interface's batched `labels()` / `definitions()` methods. The active Pronto adapter is case-sensitive even when passed OAK's `force_case_insensitive` option, so this implementation does not claim case-insensitive matching; reviewers should supply exact-label/canonicalized terms until a bounded, tested fallback is added.

The search iterator regression now uses a 1,000-result generator and confirms that a request capped at two candidates consumes only the configured 16-result prefix (`max_candidates_per_term * 8`), passes the same limit into `SearchConfiguration` when OAKLib is installed, and returns stable sorted candidates. The relationship adapter is also bounded: it consumes no more than the configured 512 relationships plus one overflow sentinel, then rejects an over-limit result instead of silently publishing a partial bundle. A local synthetic OBO integration test verifies that an existing ontology relationship reaches the DOC-14 review record with its ontology revision, while the relation proposal remains unmapped and noncanonical.

**Validation commands/results:**

- `C:\Python313\python.exe -m pytest python/test_oaklib_candidate_route_v1.py python/tests/test_okf_language_lsp_term_expander_v1.py python/tests/test_okf_local_obo_ontology_v1.py python/tests/test_doc14_relation_oak_review_v1.py -q` → `32 passed, 4 warnings in 8.88s`.
- `docker compose -f docker/miniforge-nlp-sidecar/docker-compose.yml config --quiet` → exit 0.
- Live POST `http://127.0.0.1:8095/ontology/oaklib/search` → HTTP 503 `OAKLIB_SOURCE_NOT_CONFIGURED`.

**Status:** OAK config prepared; local OAK search and relationship iterators are bounded, and a synthetic relation reaches the review record. The live service still returns 503, so service activation and all canonical review/admission/ACE gates remain open. DOC-14/15 remain open.

## Health/readiness distinction follow-up

The live sidecar was rechecked during continuation: `/health` reports general status `ok`, while a real bounded POST to `/ontology/oaklib/search` returns HTTP 503 with `OAKLIB_SOURCE_NOT_CONFIGURED`. This is consistent with the service process not having loaded the updated Compose environment. To make that distinction visible after the operator reloads the service, `python/miniforge_nlp_sidecar_v2.py` now adds a read-only `oaklibSource` field to `/health`, with `SOURCE_CONFIGURED` plus the pinned ontology SHA-256 or the exact configuration error. The field always reports `canonicalAuthority=false`; it verifies source configuration and bytes, not a live OAK search, ontology semantics, or admission.

The new health-field contract is covered by the sidecar route suite. Focused OAK/relation validation returned 33 passed, 4 dependency warnings; Python compilation and strict OpenSpec validation passed. The already-running service has not been restarted, so its health response does not yet include this new field and its search route remains 503. No datastore, graph, cache, or ontology writes occurred; no task checkbox was changed.

## Live Atlas context candidate check

A read-only `atlas-tools.build_agentic_rag_context` call for the CUDA/SIMT/OAK relation query returned 10 hybrid hits across 9 files and 7 context cards. The live tool explicitly reported `MISSING_SOURCE_REVISION`, `UNADMITTED_RETRIEVAL_CANDIDATES`, and `proofUsable=false`. The returned packet bindings had `workspaceRevision=0` and null byte spans. Results were mainly CUDA build logs and local implementation code, not admitted official API documentation. The cards therefore cannot be used as canonical relation evidence or injected as proof-bearing ACE context. Compact receipt: `docs/reports/doc14-live-ace-context-gate-20261123.json`. No retrieval/index, database, graph, ACE, or cache writes occurred.

## Fresh OAK live/API alignment check — 2026-11-23

- Windows Python 3.13 resolves `oaklib==0.7.4`. Focused OAK adapter, DOC-14 relation review, and local OBO suites returned `31 passed, 4 warnings`; strict OpenSpec validation passed.
- The implementation is iterator-aligned with the official OAK API: `SearchInterface.basic_search()` is consumed lazily; `SearchConfiguration.limit` is set to the bounded fetch cap; an independent `islice` enforces the cap. The adapter does not eagerly materialize search results. Official references: https://incatools.github.io/ontology-access-kit/packages/best-practice.html and https://incatools.github.io/ontology-access-kit/examples/Developers-Tutorial.html.
- Fresh live check: `GET /health` on `127.0.0.1:8095` reports general `status=ok`, `contract=provenance-v2`, `processId=1`, but `oaklibSource` is absent. Bounded `POST /ontology/oaklib/search` still returns HTTP 503. The running service therefore has not loaded the source-readiness change/configuration; Compose has the local read-only OBO mount and `ATLAS_OAKLIB_ONTOLOGY_ROOT` / `ATLAS_OAKLIB_ONTOLOGY_FILE` values.
- Readiness is split: local OAK implementation/API contract is fixture-proven; live sidecar OAK availability is not. No graph/ontology/ACE/cache/database writes were performed; no task checkbox changed. Human-controlled sidecar reload is still required before live OAK verification.

## Direct local OAK route proof — 2026-11-23

- Ran the actual sidecar route in the Windows Python 3.13 process with the repository OBO selected via the same `ATLAS_OAKLIB_ONTOLOGY_ROOT` and `ATLAS_OAKLIB_ONTOLOGY_FILE` contract as Compose. OAKLib 0.7.4 returned `ATLASPLAT:cuda` for “NVIDIA CUDA Platform”, `ATLASISA:ptx` for “PTX Virtual ISA”, and `ATLASLANG:cuda_cpp` for “CUDA C++”.
- The route returned `PROPOSAL_ONLY`, ontology revision `sha256:8e651ef5bd4d0f8c702a7dd751687bf912fdbe470f198ae6e41b5248517cb14c`, `canonicalAuthority=false`, and `writesPerformed=false`.
- This proves real local OAK source loading and the bounded iterator-backed search path, beyond fixture-only tests. It does not change the separate live `:8095` 503, prove the running container loaded the configuration, or admit any ontology relation.

## Runtime fingerprint and OAK mapping capability check — 2026-11-23

- Fresh live `/health` identifies the active v2 sidecar module as `sha256:dd77bcfec41e0e1ce638315b340aee59fb148bbdd276d5b21c45998075f74c52`; the current checkout module hashes to `sha256:5c2a08fd7606b6472072f43ab284f8b7c9e6cc4ae9f3eecdbc15561e85c6ada7`. The live module does not expose the newer `oaklibSource` readiness field, and live OAK search still returns 503. This is a stale runtime/configuration mismatch, not an iterator API problem.
- A direct read-only OAK Mapping Provider probe against the local 110-term OBO found zero SSSOM mappings for `ATLASPLAT:cuda`, `ATLASISA:ptx`, and `ATLASLANG:cuda_cpp`; OAK `relationships()` returned four asserted triples among those terms. Thus relationship inspection is available, but the current custom vocabulary contains no cross-ontology mapping assertions for these examples. Do not infer or mint mappings from those labels.
- Official OAK documentation describes mappings through SSSOM and `MappingProviderInterface.sssom_mappings()`, and separately documents `relationships()` as `(subject, predicate, object)` tuples: https://incatools.github.io/ontology-access-kit/guide/mappings.html and https://incatools.github.io/ontology-access-kit/guide/relationships-and-graphs.html.
- No service lifecycle or database action was taken. Next integration gate remains operator reload/reconfiguration of `:8095`, followed by verifying its module fingerprint, configured ontology digest, live search, and mapping/relationship outputs.

## OAK SSSOM mapping handoff implementation — 2026-11-23

- Extended the existing OAK adapter to call `MappingProviderInterface.sssom_mappings()` when available. Mapping rows are consumed as a bounded iterator (256 maximum plus one overflow sentinel), normalized into revision-bound `PROPOSED` records, and kept separate from ontology relationships and Parent Atlas authority. Unsupported adapters report `UNAVAILABLE`; an available provider with no rows reports `AVAILABLE` plus an empty mapping list.
- The DOC-14 review join validates mapping candidate schema, ontology/producer revisions, authority state, endpoint binding, evidence reference bounds, and finite confidence in `[0,1]`. It surfaces matching SSSOM rows as `SUGGESTED_REQUIRES_REVIEW`; it does not approve an equivalence or create a graph edge.
- Actual local OBO route smoke: OAK 0.7.4 returned three exact concept matches and four existing relation triples. Mapping Provider was available but returned zero mappings for the current custom vocabulary. Output remained `canonicalAuthority=false`, `writesPerformed=false`.
- Focused Windows Python suites: `46 passed, 4 warnings`. Python compilation and strict OpenSpec validation passed. Targeted diff check passed.
- Fresh live sidecar probe remains `503 OAKLIB_SOURCE_NOT_CONFIGURED`; its runtime hash is still `sha256:dd77bcfec41e0e1ce638315b340aee59fb148bbdd276d5b21c45998075f74c52`, not the checkout. Thus local mapping support is implemented and tested, while live sidecar activation, reviewed mappings, ontology/graph admission, and ACE readback remain open. No task checkbox or database state was changed.

## Trust-boundary correction — 2026-11-23

- Found that `scripts/atlas/run-doc14-scoped-predict-v1.py` accepted `manifest` and `rows` from stdin, then returned those same objects from its local `readback()` callback. This did not perform independent readback. Replaced that behavior with a stable fail-closed response (`ACE_VERIFIED_READBACK_TRANSPORT_NOT_CONFIGURED`); this CLI now never contacts llama-server or emits a recommendation.
- The existing TypeScript PostgreSQL owner `readContextManifestV2FromPostgresV1()` independently checks the manifest identity and payload checksums, but its result is intentionally `READBACK_MATCH_NOT_ADMITTED` and contains the stored manifest, not an authorized/admitted set of exact chunk bodies. It is not yet sufficient to satisfy the Python recommender's scoped evidence-row callback.
- Added a regression test that supplies a forged row and proves the CLI returns no recommendation and keeps `citationVerified`, `canonicalAuthority`, and `writesPerformed` false.
- Validation: focused OAK/relation/DSPy suites: 44 passed (4 upstream deprecation warnings); strict OpenSpec validation passed. CLI regression test run separately below.
- Fresh live sidecar `/health` remains `status=ok` but omits `oaklibSource`; a correctly shaped POST to `/ontology/oaklib/search` returns HTTP 503 `OAKLIB_SOURCE_NOT_CONFIGURED`. Compose already contains the OBO path and read-only mount, but service activation is operator-controlled; no restart or database/cache write was performed.
- OAK's documented iterator guidance recommends consuming multi-result interface calls incrementally and avoiding unconditional full materialization for remote/large results. The local search and relationship adapters implement explicit bounded iteration; this confirms API alignment, not live-sidecar activation or admitted mappings.
- Still open: authenticated/read-only service binding from the Python recommender to the canonical evidence readback owner; admitted relation and exact-row authorization; live OAK source activation; human-reviewed retrieval labels and held-out evaluation. No OpenSpec task was marked complete by this check.

## Port 8095 owner and activation diagnosis — 2026-11-23

- Read-only listener inspection found Windows PIDs `wslrelay` and `com.docker.backend`; Docker publishes port 8095 from container `miniforge-nlp-sidecar` (`deeds-miniforge-nlp-sidecar:latest`, Compose service/project `miniforge-nlp-sidecar`). The container is healthy and was created two months ago.
- The running container's OAK environment variables are empty. Its Compose label hash is `daf82b5659cef92df0793b4705a41e4f1b48a3ecb2bbcd9cb3ef34b9726b5979`; current Compose resolves to `bc6f03cc9d982c2dc9cd6d1aeabe7e2a5e09b4dde00639f85a7f5ab131816c3a`.
- The configured ontology exists at `/workspace/.okf/ontologies/atlas-domain-and-language-terms-v1.obo` inside the container. Its SHA-256 matches the checkout: `8e651ef5bd4d0f8c702a7dd751687bf912fdbe470f198ae6e41b5248517cb14c`.
- The current source file is bind-mounted at `/app/python` and `/workspace/python` with SHA-256 `5c2a08fd7606b6472072f43ab284f8b7c9e6cc4ae9f3eecdbc15561e85c6ada7`, but the running process health still reports its older in-memory module digest `dd77bcfec41e0e1ce638315b340aee59fb148bbdd276d5b21c45998075f74c52`; live `/health` omits `oaklibSource` and live search returns 503 `OAKLIB_SOURCE_NOT_CONFIGURED`.
- Operator-only action, not run: from repository root, `docker compose -f docker/miniforge-nlp-sidecar/docker-compose.yml up -d --no-deps --force-recreate miniforge-nlp-sidecar`. This targets the verified service only and applies the current Compose environment. Afterward verify `/health.oaklibSource.ontologyRevision`, current runtime module digest, and a bounded POST with `{ "terms": ["CUDA"] }`; require exact OBO digest, bounded results, and `canonicalAuthority=false`.
- This corrects the diagnosis: the mounted OBO is present and matches; the container process lacks the current environment and process import. No lifecycle, database, or cache action was performed.

## Source-backed CUDA relation review candidate — 2026-11-23

- Added `scripts/atlas/propose-nvidia-cuda-ptx-relation-v1.py` to capture the official NVIDIA CUDA Programming Guide with the existing BeautifulSoup normalizer, verify source hashes and exact normalized UTF-8 spans through `verify_relation_proposal_v1()`, and query the local pinned OBO through the existing OAK route. It only writes a local review report; it does not write to PostgreSQL, Graphify, Valkey, or ACE.
- The verified source sentence is `NVRTC can be used to compile CUDA C++ device code to PTX at runtime.` at normalized byte range `[9290, 9358)`. Normalized source revision: `sha256:494ef3b6ef26440375c9861ce7b02c363d9c01856630d8a009490c7a3cceca35`; raw HTML SHA-256: `63e6666baf0636441e32186ab7cbd7a4618c997fade769b6ffdd01d0aa92e48a`.
- OAK 0.7.4 on the current local OBO suggests subject `ATLASLANG:cuda_cpp`. Direct search for `PTX` returns no term; a separate label search suggests `ATLASISA:ptx` (`PTX Virtual ISA`) based on two separately byte-bound spans defining `Parallel Thread Execution (PTX)` and `virtual instruction set architecture (ISA)`. The mapping remains `SUGGESTED_REQUIRES_HUMAN_REVIEW`.
- OAK also returns the existing local OBO relation `ATLASLANG:cuda_cpp compiles_to ATLASISA:ptx`, with ontology revision `sha256:8e651ef5bd4d0f8c702a7dd751687bf912fdbe470f198ae6e41b5248517cb14c`. This is an OAK proposal from the local ontology; it is not a PostgreSQL/Graphify admitted edge.
- Proposal report: `docs/reports/doc14-nvidia-cuda-ptx-relation-proposal-v1.json`. It explicitly says source index `NOT_ADMITTED`, ontology mapping review pending, graph `NOT_ADMITTED` with null graph revision, ACE `NOT_ELIGIBLE`, `canonicalAuthority=false`, and `writesPerformed=false`.
- Predicate support and endpoint mapping semantics were extended in `relation_proposal_verifier_v1.py`; tests cover allowed `COMPILES_TO`, endpoint-specific OAK matches, and empty OAK results remaining unresolved.
- Validation: six focused suites (OAK route, DOC-14 review, relation proposal verifier, DSPy recommender, CLI fail-closed regression, and this proposal generator) passed: 53 tests, 4 upstream deprecation warnings. Strict OpenSpec validation passed. No tasks were marked done.
- Still required for the requested end-to-end result: operator activation of live `:8095`; human review of the proposed concept resolution and relation; canonical source admission/readback; graph admission with a pinned revision; ACE readback that consumes the admitted edge; then a real structured DSPy recommendation with citation verification. The online DSPy CLI remains fail-closed until an independent evidence-row readback transport exists.
- Review response received 2026-11-23: the user approved `CUDA C++ — compiles_to → PTX` for the review workflow. Recorded separately in `docs/reports/doc14-nvidia-cuda-ptx-human-review-v1.json`, bound to the proposal file checksum. This decision is limited to semantic relation/term selection; source-index admission, graph admission, ACE usability, canonical authority, and write authorization all remain false.
- Current continuation validation: Windows Python 3.13 focused relation-proposal, verifier, and fail-closed DSPy bridge suites passed 9/9; `py_compile` passed; strict OpenSpec validation passed. `git diff --check` is clean for the changed files; repository-wide invocation separately reports pre-existing trailing whitespace at root `docker-compose.yml:167`.
- Canonical source-owner recheck: a repeatable read-only query against PostgreSQL 18 found zero `atlas_external_doc_pages` rows for the NVIDIA CUDA Programming Guide URL. The existing `sveltekit-frontend/src/lib/server/atlas/docs/external-doc-admission.ts` is the canonical page/chunk writer; its callers require acquisition/extraction lineage and a transactional readback. No direct insert was attempted. Current graph snapshot/revision is still absent, so the reviewed tuple cannot yet be admitted as a revision-bound graph edge.
- Fresh official capture cross-check: Firecrawl retrieved the NVIDIA CUDA Programming Guide page successfully (HTTP 200; page metadata reports v13.5, last updated 2026-10-31) and includes the exact NVRTC sentence. This confirms the current publisher text; it is not a canonical PostgreSQL acquisition record.
- Latest live gate check: `audit-current-structural-edge-contract-v1.mjs` remains `CONTRACT_INCOMPLETE` with 0 nodes, 0 edges, and `graphRevision=null`. Live `:8095/health` reports general `ok` but no `oaklibSource` or runtime module digest, while bounded OAK search still returns HTTP 503 `OAKLIB_SOURCE_NOT_CONFIGURED`. The service has not been operator-recreated.

## Fresh live OAK continuation check — 2026-11-23

- `GET http://127.0.0.1:8095/health` returns general `status=ok`, but its runtime module fingerprint is `sha256:dd77bcfec41e0e1ce638315b340aee59fb148bbdd276d5b21c45998075f74c52`; the checkout's `python/miniforge_nlp_sidecar_v2.py` is `sha256:5c2a08fd7606b6472072f43ab284f8b7c9e6cc4ae9f3eecdbc15561e85c6ada7`. The response has no OAK source digest/readiness field.
- A bounded POST using the route's actual `{terms:[...], maxCandidatesPerTerm:...}` request schema returns HTTP 503 `OAKLIB_SOURCE_NOT_CONFIGURED`.
- The checked-in Compose service already sets `ATLAS_OAKLIB_ONTOLOGY_ROOT=/workspace/.okf/ontologies` and `ATLAS_OAKLIB_ONTOLOGY_FILE=atlas-domain-and-language-terms-v1.obo`. Its repository, Python source, and classifier mounts are read-only. The mismatch is therefore runtime activation/configuration, not a missing local ontology file.
- The scoped operator reload is `docker compose -f docker/miniforge-nlp-sidecar/docker-compose.yml up -d --no-deps --force-recreate miniforge-nlp-sidecar`. It recreates only this sidecar container; the configured mounts are read-only and no PostgreSQL, Valkey, Qdrant, or other container is targeted. Data written only to the sidecar container's temporary writable layer would not survive recreation. No Docker lifecycle command was run.
- The user-approved relation remains checksum-bound to the proposal and `APPROVED_FOR_REVIEW_WORKFLOW`; source-index admission, graph admission, ACE usability, canonical authority, and write authorization remain false. The approved relation is not an authorization to write canonical stores.
- Dependency check: `docker/miniforge-nlp-sidecar/Dockerfile` already pins `oaklib==0.7.4`; the OAK endpoint imports the existing adapter lazily. No separate `pip install` or image rebuild is needed for this checkout's current OAK code/config. Recreate the sidecar only after the operator confirms the intended Compose project. The reviewed proposal checksum exactly matches the proposal currently on disk.

## Live OAK activation and relation lookup — 2026-11-23

- Operator recreated `miniforge-nlp-sidecar`; no agent Docker lifecycle action was run. Container reached `healthy` after a brief startup window. Startup healthcheck logged transient `ModuleNotFoundError: No module named 'python'` attempts, followed by successful Uvicorn startup; this warrants cleanup, but did not prevent the endpoint from becoming healthy.
- Live `POST /ontology/oaklib/search` for `CUDA C++` and `PTX Virtual ISA` returned `PROPOSAL_ONLY`, pinned OBO revision `sha256:8e651ef5bd4d0f8c702a7dd751687bf912fdbe470f198ae6e41b5248517cb14c`, and producer module revision `sha256:5c2a08fd7606b6472072f43ab284f8b7c9e6cc4ae9f3eecdbc15561e85c6ada7`. It resolved `ATLASLANG:cuda_cpp` and `ATLASISA:ptx`.
- Live `POST /ontology/oaklib/candidates` for those IDs returned the existing `ATLASLANG:cuda_cpp compiles_to ATLASISA:ptx` relation and its ontology neighbors, all proposal-only; `canonicalAuthority=false`, `writesPerformed=false`.
- The review record's proposal checksum matches the proposal file on disk and records the user decision `APPROVED_FOR_REVIEW_WORKFLOW`. That decision remains limited to semantic review and does not authorize source or graph admission.
- Atlas `find_source_refs` still returns `NO_PACKET` for both the NVIDIA guide URL and the pinned pgvector local document. The current structural-edge audit remains `CONTRACT_INCOMPLETE`, zero nodes, zero edges, and null graph revision. No canonical source or graph write was attempted.

## Live retrieval-to-ACE boundary check — 2026-11-23

- `build_agentic_rag_context` returned 5 cards from 8 ranked code hits, none of which was the NVIDIA documentation page. Its receipt reports `revisionStatus=MISSING_SOURCE_REVISION`, `admissionStatus=UNADMITTED_RETRIEVAL_CANDIDATES`, and `retrievalAdmission.proofUsable=false`; some cards have null source revisions and workspace revision `0`.
- The returned tool payload still contains a diagnostic `promptPacket`. The live SvelteKit `/api/ace/stream` source checks server-owned synthesis admission before starting the preamble and emits `ACE_CONTEXT_MANIFEST_ADMISSION_REQUIRED` on the blocked path. I did not invoke the model with these cards.
- Current integration status: live OAK lookup and relation inspection are proven proposal-only; canonical NVIDIA page/chunk admission is absent; Atlas source lookup is `NO_PACKET`; graph snapshot remains absent; ACE proof/readback remains unavailable. Do not train GEPA or rankers on these unreviewed or revision-incomplete results.

## Same-source recapture against the live OAK runtime — 2026-11-23

- Re-ran `scripts/atlas/propose-nvidia-cuda-ptx-relation-v1.py` against the official NVIDIA guide with the live `:8095` OAK client. The output is `docs/reports/doc14-nvidia-cuda-ptx-relation-recapture-20261123.json` and remains `PROPOSAL_ONLY` with `writesPerformed=false`.
- The recapture reproduced the approved source identity exactly: normalized source revision `sha256:494ef3b6ef26440375c9861ce7b02c363d9c01856630d8a009490c7a3cceca35`, raw HTML SHA-256 `63e6666baf0636441e32186ab7cbd7a4618c997fade769b6ffdd01d0aa92e48a`, sentence byte span `[9290, 9358)`, and identical evidence text. The prior review's evidence binding is therefore still byte-identical to this recapture.
- Live OAK label search resolves both reviewed concept IDs at the pinned ontology revision. Bounded candidate inspection returns `ATLASLANG:cuda_cpp compiles_to ATLASISA:ptx`; the separate mention search for the abbreviation `PTX` alone is unresolved, while the source-bound acronym-expansion and definition spans support the reviewed `PTX Virtual ISA` mapping. Keep that mapping review-only.
- The sidecar health response reports `status=ok`, `oaklibSource.status=SOURCE_CONFIGURED`, and the same OBO/module digests. Its `model` label is `ornith-1.5-9b`, which differs from the operator-confirmed active `:8090` Gemma 4 model; this sidecar field is not proof of the `:8090` model and does not affect the OAK lookup.
- The envelope builder's default Python launcher failed because it lacked the repository's Pydantic environment; using `C:\\Python313\\python.exe` plus `PYTHONPATH=.;python` loads its CLI. No builder acquisition or canonical admission was run. `requestAcquisition()` and `runAcquisitionWorkerCycle()` currently have no production call site under `sveltekit-frontend/src`; do not claim the canonical acquisition worker is wired for this document.
- No PostgreSQL, Graphify, ACE, Valkey, or Qdrant writes were attempted. The exact remaining blocking transition is canonical source acquisition/admission through an authorized existing owner, followed by graph admission/readback and ACE consumption.

## Existing-owner source admission plan — 2026-11-23

- Used the existing bounded external-doc pipeline to capture the NVIDIA page into `.tmp/doc14-nvidia-admission-20261123/`; it produced 1 page and 12 chunks, no acquisition failures, and a page hash matching the approved normalized source revision. The live `:8095` analysis was read-only and stamped domain metadata on the chunks.
- Ran `sveltekit-frontend/scripts/atlas/run-external-doc-admission-v1.mts` in `PLAN_READ_ONLY` mode against that exact envelope. Result: `PILOT_CAPTURE_MATCH`, classification `MISSING`, 1 page, 12 chunks, `writerCalls=0`, and no citation/readback yet.
- This is a concrete canonical-admission plan, not an admitted row. The runner's `--apply` requires `ATLAS_DOC_ADMISSION_AUTHORIZED=I_AUTHORIZE_CANONICAL_ADMISSION`; no authorization value was set and no apply was attempted. After the page/chunks are admitted, the relation must be rebound to the canonical chunk ID and evidence revision, read back from PostgreSQL, then graph-admitted through the existing owner before ACE can consume it.
- Current completion gates: OAK runtime/source lookup **PROVEN**; official source capture and read-only plan **PROVEN**; canonical PostgreSQL page/chunk admission **NOT DONE**; revision-qualified graph edge **NOT DONE**; ACE use/readback **NOT DONE**.
