# Parent Atlas Binary Lane Validation V1

**Status:** descriptor contract created; focused contract and reusable FSM/CSR
guard tests pass; artifact IO, runtime orchestration, revision swaps, and
performance crossover remain unproven.

**Baseline revision inspected:** `adc7460d653c41c0aa0bb49d8802d68307ed0fd0`

**Scope:** establish the safe descriptor contract and the next reproducible
tests for packed bitsets, the `ComputePool` Hamming proposal, and browser
WebGPU cosine scoring. This report does not claim a production lane switch.

## Summary

The repository already has separate owners for aligned bitset bytes, packet
representation manifests, CPU worker computation, a Hamming128 proposal, and
browser WebGPU similarity. Those pieces do not yet make a single production
path. In particular, Hamming128 scores 16-byte signatures while WebGPU scores
quantized dense vectors; their timing results cannot be compared as if they
were the same workload.

This change adds a revision-bound descriptor for a read-only packed-bitset
slice and tests its identity, layout, range, and checksum guards. It does not
open files, create artifacts, write a cache, or dispatch work. The report below
defines the additional adapter, parity, and end-to-end checks required before
using a size threshold to select CPU or WebGPU.

## Files created

- `sveltekit-frontend/src/lib/server/atlas/tensors/bitset-slice-descriptor-v1.ts`
  defines `atlas.bitset-slice-descriptor.v1`.
- `sveltekit-frontend/src/lib/server/atlas/tensors/bitset-slice-descriptor-v1.spec.ts`
  checks valid slices and adversarial descriptor cases.
- `docs/reports/parent-atlas-binary-lanes-v1/README.md` records scope, current
  evidence, and the implementation/test sequence below.

## Descriptor contract

The descriptor carries:

- a relative POSIX `mmapPath`, storage format (`mmap_raw` or `arrow_ipc`),
  buffer offset, byte length, and required alignment;
- `bitCount`, `bitOrder: LSB0`, and `endianness: LE`;
- a SHA-256 digest of the referenced slice;
- workspace, source, candidate snapshot, representation, and ordinal-map
  revision bindings; and
- fixed `canonicalAuthority: false` and `writesPerformed: false` claims.

`mmapPath` is a reference, **not permission to open that path**. A future
adapter must resolve it beneath a configured read-only artifact root, reject
symlinks/path escapes, verify file identity and bounds, and hash the exact
slice before constructing a view. JSON/gRPC carries this descriptor only;
the bulk bytes stay in the shared mmap or Arrow IPC artifact. PostgreSQL remains
the owner of identity and revision evidence. This contract is not a registry
or an artifact writer.

For Arrow IPC, `fieldRef` is required. The Arrow reader must resolve the field
and buffer using Arrow metadata before treating the resulting slice as the
declared byte range. The descriptor schema alone does not establish that the
file is a valid Arrow IPC artifact.

The CPU tensor adapter should expose the verified slice as `uint8`, for
example `torch.frombuffer(memoryview, dtype=torch.uint8)`. It should unpack
bits from bytes with explicit LSB0 shifts, not depend on unsigned 64-bit tensor
operations. A verified buffer view is still non-canonical and read-only.

## Current source findings

| Lane | What exists | What remains unproven |
| --- | --- | --- |
| Aligned bitset | `aligned-bitset-blob-v1.ts` provides a versioned payload and checksum, PostgreSQL `bytea` conversion, and WebGPU aligned-buffer conversion. | No shared-artifact resolver or cross-language bitset slice reader is wired to this descriptor. |
| Representation artifacts | `packet-representation-manifest-v1.ts` supports `mmap-raw` and `arrow-ipc`, checksums, shape/stride and revision metadata. | It has no bit-order field or explicit mmap slice range. This new descriptor is a derived slice contract, not a replacement identity owner. |
| PyTorch/Arrow | Existing native-core tests exercise `torch.frombuffer` and an Arrow IPC to ATen tile view. | Those tests are not parity proof for this bitset descriptor or its LSB0 payload. |
| CPU Hamming | `hamming128-proposal-v1.ts` binds results to a candidate ordinal map and caps a proposal at 4,096 rows. The worker rejects 4,097. | The proposal helper has no production caller. AVX2 timing is not a 768-D dense-cosine benchmark. |
| WebGPU cosine | `webgpu-similarity-engine.ts` and `webgpu-similarity-service.ts` implement dense similarity. The service selects WebGPU after initialization for more than 10 vectors. | The source search found the demo component as the caller; no production retrieval integration or same-data CPU/WebGPU benchmark was found. |
| Performance claim | The request cites `0.146 ms` for 4,096 rows. | That value was not found in the checked-in report/source search during this work. It remains an operator-supplied claim until a raw receipt, device/runtime identity, and exact benchmark command are attached. |

The 4,096-row Hamming result cannot establish that WebGPU or AVX2 is faster
for dense 768-dimensional cosine. Nor does either lane establish the optimal
crossover for the complete retrieval path, which includes data access,
serialization, queueing, transfer, shader dispatch, readback, and ranking.

## Focused test added and run

Command, from `sveltekit-frontend`:

```powershell
npx vitest run src/lib/server/atlas/tensors/bitset-slice-descriptor-v1.spec.ts
```

Observed on 2026-11-12:

```text
Test Files  1 passed (1)
     Tests  13 passed (13)
Duration   10.75s
Exit code  0
```

The suite covers valid mmap metadata, path traversal and path normalization,
offset alignment, bit-count/length mismatch, Arrow field binding, hashing a
typed-array view rather than its backing buffer, payload tampering, nonzero
unused LSB0 padding bits, and stale workspace/representation bindings.

This is **contract unit proof only**. It did not open a mapped file, parse an
Arrow file, call `torch.frombuffer`, invoke the native AVX2 addon, run a browser,
or exercise production retrieval.

### Broader owner checks run for the FSM/LUT review

Command, from `sveltekit-frontend`:

```powershell
npx vitest run src/lib/server/atlas/tensors/bitset-slice-descriptor-v1.spec.ts src/lib/server/atlas/fsm/nes-feature-token-pipeline.spec.ts src/lib/server/atlas/taxonomy/task-domain-lut-reconciliation-v1.spec.ts src/lib/server/atlas/cache/bitfrost-token-fsm-v1.spec.ts src/lib/server/atlas/graph/csr-traversal-cursor.spec.ts src/lib/server/atlas/evals/ornith-tool-call-guard-v1.test.ts
```

Observed on 2026-11-12:

```text
Test Files  6 passed (6)
     Tests  58 passed (58)
Duration   15.68s
Exit code  0
```

Command, from `sveltekit-frontend`:

```powershell
npm run check:fast
```

Observed: exit code `0`; `svelte-check found 0 errors and 1 warning in 1 file`.
Vite also reported that its `root` option is overridden by SvelteKit. This is
not a zero-warning check and does not constitute a clean warning-free gate.
The check was run after adding the descriptor contract; no database or service
integration was part of it.

### Revision and artifact identity

The inspected Git `HEAD` was `adc7460d653c41c0aa0bb49d8802d68307ed0fd0`.
The worktree was already dirty; that `HEAD` identifies the base revision only,
not all source bytes used by the checks. SHA-256 of the new review artifacts:

```text
7b6dbbd6c40968e79365142c9a873c36543f7d9f51caf1e2817e4afb19076e08  sveltekit-frontend/src/lib/server/atlas/tensors/bitset-slice-descriptor-v1.ts
955cd39f23b6233ed638810ff3dd7a7df130e2667832c8d88ce9f3386ab9fb2a  sveltekit-frontend/src/lib/server/atlas/tensors/bitset-slice-descriptor-v1.spec.ts
```

The README is a report, not an execution receipt. These hashes identify the
new contract/test files as checked at report time; they do not attest to the
full dirty worktree snapshot.

## FSM, LUT, quantization, traversal, and swap validation

The proposed hot loop is a deterministic CPU execution lane around existing
owners. Its ordered contract is:

1. Resolve a verified domain through the existing versioned palette/LUT; do
   not infer an ID from a label at runtime. The current reconciliation fixture
   maps `ui` to `0x02` and keeps proposal-only domain additions separate from
   the established palette.
2. Validate state and event ranges, then perform the bounded transition lookup.
   An absent/blocked entry is an explicit refusal, never a default transition.
3. Intersect candidate actions with the exact authorization/capability mask
   before scoring or ranking. Quantized scores can order already-authorized
   choices; they cannot grant permission.
4. Iterate a bounded sparse candidate set through validated CSR offsets and
   neighbors. Preserve canonical IDs while reordering.
5. Write the next iteration to a scratch buffer and swap only after the full
   iteration succeeds. Do not publish partial state.
6. Publish only a validated, source/revision-qualified result. This is a
   proposal/result boundary; it does not mark a task complete or mutate
   canonical identity.

Existing contracts/tests to reuse:

| Concern | Existing owner/test | What the current suite establishes | Remaining proof |
| --- | --- | --- | --- |
| Domain byte mapping | `taxonomy/task-domain-lut-reconciliation-v1.ts` and its spec | Current task-domain reconciliation preserves the canonical palette and known `ui` code. | Native C++ and TS readers consume the exact same frozen palette bytes and revision. |
| Feature state | `fsm/nes-feature-fsm.ts`, `fsm/nes-feature-token-pipeline.ts`, and `nes-feature-token-pipeline.spec.ts` | Existing advisory state/token behavior and proposal-only authority boundary. | Add a table-driven state/event LUT for this repair loop; test out-of-range IDs, missing rows, explicit blocked transitions, and deterministic replay. |
| Authorization before choice | `neural-routing/tool-candidate-materializer.ts` and `evals/ornith-tool-call-guard-v1.test.ts` | Candidate materialization and registered-tool/evidence-manifest guards exist. | Assert unauthorized actions are removed before rank/tie-break, and no MCP call is emitted on an empty mask or stale ACE receipt. |
| Quantized score | No matching fixed-point score contract found in the inspected owners. | Nothing yet proves float-to-integer quantization preserves the required ranking. | Compare float oracle to the selected integer format at ties, endpoints, saturation, NaN/Infinity rejection, and near-ties; publish maximum error and top-K order changes. Keep auth bits exact and outside this quantizer. |
| Sparse traversal | `graph/csr-traversal-cursor.ts` and its spec | CSR bounds, cursor identity, depth/page limits, and malformed offsets are guarded. | Add duplicate-neighbor, empty-row, cycle, deterministic order, and traversal-budget fixtures for the selected FSM iteration. |
| Active/scratch swap | `cache/bitfrost-token-fsm-v1.ts` and its spec | Per-candidate state transitions, revision checks, budgets, and lease-aware residency are tested. | No single-buffer atomic swap test for immutable LUT revisions was found. Test readers holding the old revision, failed build/validation, CAS conflict, cancellation, and rollback to the retained previous revision. |
| Cache publication | `tensors/bitfrost-valkey-contract.ts` | A Valkey contract exists. | No evidence in this slice of a writer that builds an immutable versioned payload and atomically CAS-updates an active pointer only after checksum and admission validation. Keep PostgreSQL canonical; Valkey is disposable projection/cache. |
| Native ordering | `packages/atlas-native-core/include/radix_sort.hpp`, `simd-bridge/cpp/nes_lut_filter.h` | A SOM tile radix sorter and scalar/AVX2 NES LUT filter exist. | Add C++ parity tests against scalar/reference order, stability/tie rules, empty and boundary input, and byte-for-byte v1 palette fixtures. Do not use the radix sorter as the FSM transition owner. |
| UI/runtime boundary | SvelteKit SSR, Svelte CSR, Bits UI controls | Existing UI components can project state. | Test that UI actions call the authorized server/tool boundary and cannot set an authoritative state or publish a LUT. No per-iteration SSE is needed; use SSE only for asynchronous completed-job/revision notifications. |

### Required focused proof matrix

1. **LUT/FSM CPU reference:** freeze a palette and transition manifest by
   source revision and SHA-256. Test every valid state/event pair, blocked
   pairs, invalid IDs, and repeat-run deterministic output. Check the
   `ui -> 0x02` mapping against the canonical palette, not a duplicated test
   constant.
2. **Authorization mask adversary:** provide a high-scoring unauthorized
   candidate and a lower-scoring authorized candidate. The unauthorized one
   must never be selected or dispatched. Probe zero permissions, stale grants,
   and an unregistered tool; assert zero downstream calls.
3. **Quantization oracle:** specify the integer scale/rounding rule. Test
   `0`, `1`, half-step ties, values just around ties, clipping, malformed
   floats, and score pairs whose order can flip. Bound numeric error and
   report exact top-K changes. Never quantize an authorization mask.
4. **CSR iteration:** test empty and singleton rows, duplicate edges, cycles,
   maximum depth/fanout, malformed/nonmonotone offsets, and deterministic
   output. A limit breach must refuse or return a clearly incomplete
   proposal; it must not silently claim a full traversal.
5. **Ping-pong buffer safety:** seed active and scratch with sentinels. Inject
   failure at each iteration stage and show active remains byte-identical;
   only a fully validated iteration swaps. Verify a concurrent reader sees
   either the old or new immutable revision, never a partially written table.
6. **Valkey revision swap:** write a new immutable key, independently read and
   checksum it, validate manifest/source revision and authorization, then
   compare-and-swap the active pointer against the expected prior revision.
   Test corrupt bytes, stale source, concurrent publisher, reader lease,
   eviction, cancellation, and rollback. PostgreSQL/outbox owns canonical
   admission; no placeholder or synthetic revision is accepted.
7. **MCP dispatch:** use the existing registered-tool guard and real dispatch
   boundary. Require an authorized tool ID, schema-valid args, current
   source-qualified ACE receipt, and bounded call budget. Assert no dispatch
   for missing/stale receipt, wrong task/workspace, revoked grant, blocked
   transition, or unregistered ID.
8. **Independent result readback:** compare the published result’s manifest,
   palette/LUT revision, task/source identity, checksums, and output bytes with
   the source of authority. Completion remains a separately authorized event.

The intended storage and rendering boundaries are deliberately narrow:

- PostgreSQL 18 owns canonical identity, source/task bindings, authorization,
  and admitted revisions. It does not run the per-candidate loop.
- CPU/native code runs the deterministic bounded LUT/FSM/CSR loop. Quantized
  rankings are hints within the authorized set.
- Valkey/BitFrost may hold immutable checksummed hot copies and a revision
  pointer. It is not authority; failed pointer swaps leave the prior revision
  active.
- SSR may load an already-authorized initial state and active revision.
  Interactive transitions run outside SSR through the existing authorized
  service boundary. CSR/Bits UI displays state and collects user actions; it
  does not authorize tools.
- SSE is reserved for asynchronous job completion or a newly published
  revision, not each internal LUT iteration.

## Radix-sort header and Node-API alignment

The C++ header already existed at `packages/atlas-native-core/include/radix_sort.hpp`.
It sorts SOM/KMeans candidate records by the composite key
`(kmeans_cluster_id, som_bmu_id, candidate_ordinal)`. It is **not** the NES
domain byte LUT, nor a state/event transition table. The NES domain filter is a
separate owner under `simd-bridge/cpp/`.

The Node-API export also already existed as
`radixSortSomCandidateIndicesV1` in `packages/atlas-native-core/src/atlas_native_addon.cc`.
The actual consistency gap was that the Python/pybind surface rejected
duplicate candidate ordinals while Node-API accepted them, and the 65,536 row
bound lived only in the Node-API wrapper. The update moves that bound to the
shared C++ header, applies the same duplicate-ordinal refusal in Node-API, and
aligns pybind plus the pure-Python fallback with the same cap and uniqueness
rule. Sorting still returns source indices so callers preserve their original
candidate identities.

Files changed for this alignment:

- `packages/atlas-native-core/include/radix_sort.hpp`
- `packages/atlas-native-core/src/atlas_native_addon.cc`
- `packages/atlas-native-core/src/pybind_module.cc`
- `packages/atlas-native-core/tests/native_core_smoke.cc`
- `packages/atlas-native-core/tests/native_addon_smoke.cjs`
- `python/atlas_corpus_lib/atlas_corpus_lib/cudf_kernel_cache.py`
- `python/atlas_corpus_lib/tests/test_corpus_helpers_v1.py`

Tests added or expanded:

- `native_core_smoke.cc` compares the radix output against `std::stable_sort`
  over composite keys, with cluster/cell/ordinal boundary values. It checks
  empty input, malformed composite-key rejection, and the over-limit refusal.
- `native_addon_smoke.cjs` verifies Node-API result order, empty input,
  duplicate-ID rejection, count overflow rejection, and typed-array views with
  nonzero byte offsets.
- `test_corpus_helpers_v1.py` checks Python fallback duplicate-ID and count
  refusals. Existing pybind parity is exercised through CTest.

Build command, run through WSL at repository revision
`adc7460d653c41c0aa0bb49d8802d68307ed0fd0` with a dirty worktree:

```powershell
wsl.exe -e bash -lc "cd /mnt/c/Users/james/Videos/deeds-web-app/packages/atlas-native-core && cmake --build build --target atlas_native_core_smoke atlas_native_core_napi _atlas_native_core -j2"
```

Observed: all three targets built successfully; exit code `0`.

Focused native command:

```powershell
wsl.exe -e bash -lc "cd /mnt/c/Users/james/Videos/deeds-web-app/packages/atlas-native-core && ctest --test-dir build -R 'atlas_native_core_smoke|atlas_native_node_api_smoke|atlas_native_python_parity' --output-on-failure"
```

Observed: `100% tests passed, 0 tests failed out of 3`; C++ core smoke,
Node-API smoke, and pybind parity all passed; exit code `0`.

Focused pure-Python command:

```powershell
wsl.exe -e bash -lc 'cd /mnt/c/Users/james/Videos/deeds-web-app && PYTHONPATH=python/atlas_corpus_lib /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python -m pytest -q python/atlas_corpus_lib/tests/test_corpus_helpers_v1.py -k radix'
```

Observed: `1 passed, 25 deselected`; exit code `0`.
The default WSL Python did not have pytest installed; the command above uses
the repository's existing `atlas-rapids-cu13` Python environment.

The scoped `git diff --check` for the seven changed source/test files exited
`0`; Git emitted only its existing LF-to-CRLF normalization warnings.

This proves C++ header, Python, pybind, and the built Node-API addon agree on
the tested ordering and input guards. It does **not** prove the SvelteKit app
loads this addon: source search found no production TypeScript caller of
`radixSortSomCandidateIndicesV1`. Nor does it wire radix ordering into NES
domain filtering, the diagnostic repair FSM, Valkey publication, or MCP
dispatch. Those remain separate integration gates.

Do not combine latency claims across different work: Hamming128 filtering,
dense cosine scoring, state-transition lookup, and graph traversal need
separate baselines. The `0.146 ms` AVX2 number and the proposed CPU/WebGPU
`<=10,000` crossover remain unverified until same-fixture receipts include
queueing, serialization, transfer, initialization, execution, readback, memory,
and output-parity measurements.

## Required next steps

### 1. Add the read-only shared artifact adapter

Implement a narrow adapter that receives a validated descriptor plus an
admitted artifact root. It must:

1. canonicalize the root and resolved file path and reject escapes, symlinks,
   unexpected reparse points, and non-regular files;
2. open read-only and check file identity/size before and after reading the
   requested range to catch replacement or truncation races;
3. validate offset, declared alignment, byte extent, and exact slice SHA-256;
4. for Arrow IPC, validate schema/field/dtype and resolve the actual value
   buffer from Arrow metadata instead of trusting a caller-supplied offset;
5. return a read-only `Uint8Array` view (or a documented copy where runtime
   alignment requires one); and
6. emit a receipt that binds descriptor checksum, artifact checksum, slice
   checksum, identity/revision bindings, and reader version.

Do not expose a raw `mmapPath` on an API boundary without a configured shared
root and authorization policy. Windows and container path translation must be
proven; a host path is not automatically visible inside a container or remote
gRPC worker.

### 2. Prove byte and tensor parity

Use one frozen fixture containing boundary bits (0, 1, 7, 8, 63, 64, 127,
127/128 boundary), a partial final byte, and known high/low nibble patterns.
Independently read it as:

- TypeScript LSB0 bit access;
- C++ byte/bit access;
- Python `memoryview` / NumPy `uint8`; and
- PyTorch `torch.frombuffer(..., dtype=torch.uint8)` followed by byte-wise
  LSB0 shifts.

Compare all bytes, selected indices, popcount, and checksum. Include a
big-endian host emulator or explicit swapped-byte adversarial fixture, a
misaligned file offset, a truncated slice, a tampered checksum, and a stale
representation revision. Keep TurboVec MSB-first layouts a separate format;
only test conversion through an explicit adapter.

### 3. Prove the CPU Hamming proposal lane

Run the existing worker probe against a frozen candidate ordinal map and the
Windows addon whose path and binary hash are recorded in the receipt. Include
0, 1, 31, 32, 33, 64, and 4,096 candidates, and adversarially reject 4,097.
Compare every distance and ordinal with an independent scalar implementation.
Record cold start separately from warmed runs, then report p50/p95 across at
least 100 repetitions, CPU model, backend name, addon SHA-256, and pool size.

Keep the 4,096 cap until the 10,000-row case has a separate bounded memory and
parity proof. Raising the current cap is not implied by the cited 4,096-row
measurement.

### 4. Prove dense CPU/WebGPU parity in a real browser

Use the **same** frozen quantized vectors, query, scaling metadata, top-K, and
candidate ordinal map on both paths. Compare score error and exact top-K
membership/order against a CPU cosine oracle. Fix numeric tolerances before
running. Exercise candidate counts 0, 1, 10, 11, 500, 1,024, 4,096, and 10,000;
include duplicate vectors, all-zero vectors, ties, NaNs/infinities rejected at
input, and dimensions/byte lengths at both boundaries.

Run with WebGPU enabled and disabled. If no adapter/device is available, report
`PARTIAL` for the GPU lane and preserve the CPU result. Record browser/GPU,
adapter features, shader revision, initialization time, warm/cold timings,
transfer bytes, dispatch time, readback time, peak buffers, and context-loss
fallback behavior.

### 5. Select a threshold from end-to-end measurements

Benchmark equivalent dense-cosine work through the full candidate path, not
just the inner kernel. Compare:

- current PostgreSQL/pgvector or exact CPU baseline;
- CPU `ComputePool` path, including queue/worker transfer;
- WebGPU with vectors already resident in the browser; and
- WebGPU when bytes must first be fetched/transferred.

Measure p50/p95, memory, bytes transferred, recall/top-K parity, and cold-start
cost. Use separate curves for binary Hamming filtering and dense cosine
rescore. The selected policy must be derived from these receipts, support
fallback when WebGPU is unavailable or slower, and bind cache entries to the
same dataset/query/representation revisions.

### 6. Wire only after the proofs

The future retrieval caller should:

1. authorize the case/workspace before opening artifacts or querying caches;
2. bind candidate signatures/vectors to a current ordinal map and source,
   workspace, and representation revisions;
3. use Hamming only as a proposal/filter, then exact-rescore the bounded dense
   candidate set;
4. preserve canonical IDs and source references through all reorderings;
5. normalize outputs into the existing SearchRuntime single fusion owner; and
6. cache only checksummed, revision-qualified artifacts/descriptors, never
   hidden reasoning or mutable tensor contents.

## Acceptance checklist

- [x] Descriptor contract exists and fails closed on malformed ranges,
  revisions, checksum, and bit padding.
- [x] Focused descriptor spec passes 13/13.
- [x] Existing domain-LUT, NES feature pipeline, BitFrost FSM, CSR cursor, and
  registered-tool guard focused specs pass together (58/58 across six files).
- [x] C++ radix header, Node-API export, pybind, and Python fallback ordering
  and guard parity passes in focused native/Python checks.
- [ ] Shared-root mmap/Arrow resolver is implemented and adversarially tested.
- [ ] TypeScript/C++/Python/PyTorch bit-order and checksum parity passes.
- [ ] CPU transition LUT/FSM proof passes for all valid/blocked/boundary pairs.
- [ ] Quantized ranking parity/error budget and authorization-before-ranking
  adversarial proof passes.
- [ ] CSR duplicate/empty/cycle/deterministic-order proof passes for the loop.
- [ ] Active/scratch iteration and immutable Valkey revision CAS/rollback proof
  passes with concurrent-reader coverage.
- [ ] Registered MCP dispatch proves current authorization and source-qualified
  ACE receipt with zero-call denial cases.
- [ ] SvelteKit production path loads the built Node-API radix export and keeps
  the existing canonical CandidateOrdinal identity intact.
- [ ] Native AVX2 worker parity and reproducible benchmark receipt exists.
- [ ] Browser WebGPU dense-score parity passes on the same fixture as CPU.
- [ ] Crossover threshold is supported by end-to-end latency and recall receipts.
- [ ] Production caller preserves authorization, identity, revisions, and one
  SearchRuntime fusion vote.
- [ ] Independent readback confirms stored artifact and cache checksums.

**GAN:** CREATED — descriptor/test/report and shared-header radix guards exist.
WIRED — radix is called by the C++ tile assembler and Python/native adapters;
the Node-API export is available, but no SvelteKit production caller was found.
The descriptor and proposed FSM loop are not connected to a production
artifact reader, authorized dispatch path, or Valkey revision swap. PROVEN —
the six TypeScript specs pass 58/58, native C++/Node-API/pybind CTest passes
3/3, and the focused Python test passes 1/1. These prove component contracts,
not the unified loop, cache swap, authorized dispatch, GPU lane, or end-to-end
retrieval. DONE — no.

No database, schema, cache, service, GPU, or canonical task state was changed
for this report.
