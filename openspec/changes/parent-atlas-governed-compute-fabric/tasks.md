# Tasks — Parent Atlas Governed Compute Fabric

This is a long-horizon coordination change for the integration seams between the
TypeScript Parent Atlas host, persistent Python composition, Python-backed skills,
MCP/ACP/A2A actions, revisioned evidence/artifacts, and native GPU backends.

It MUST reuse existing owners. It does not create a second SearchRuntime, RRF owner,
canonical identity system, ContextManifest owner, graph truth owner, vector store,
ACE residency owner, or mutation/materialization path.

OpenSpec `tasks.md` is parsed as a checkbox implementation plan. Source scaffolds that
already exist on draft PR #8 are still left unchecked below until they are reconciled,
type-checked, fixture-tested, and live-proven at the appropriate gate.

## 0. Pre-flight ownership and OpenSpec reconciliation

- [ ] 0.1 Read this change together with `parent-atlas-ace-rlm-bitfrost-integration`,
      `parent-atlas-agentic-repair-bundle-integration`,
      `parent-atlas-gpu-graph-vector-substrate`,
      `parent-atlas-tensor-residency-integration`,
      `parent-atlas-semantic-768-canonical-contract`,
      `parent-atlas-graph-analysis-contract`, and
      `parent-atlas-graph-retrieval-proof`; write an ownership table before adding
      any new production owner.
- [ ] 0.2 Inventory the draft PR #8 kernel/skill/runtime scaffolds and classify each as
      `EXISTS_UNPROVEN`, `WIRED_SHADOW`, `LIVE_PROVEN`, `SUPERSEDED`, or `ORPHAN`.
- [ ] 0.3 Audit `sveltekit-frontend/python/parent_atlas_policy` and
      `sveltekit-frontend/python/parent_atlas_tensor`; identify functions that should
      become shared skill dependencies rather than duplicated inside skills.
- [ ] 0.4 Audit `simd-bridge/cpp/binding.cc`, `cuvs_bridge.cc`, LibTorch/CUDA translation
      units, and current Node-API exports; record which external libraries are linked
      directly into the `.node` binary and which functions already use a C-shaped seam.
- [ ] 0.5 Audit current Windows DLL discovery/loading code and document every location
      that mutates `PATH`, relies on ambient DLL search order, or assumes one fixed
      LibTorch/CUDA/cuDNN installation.
- [ ] 0.6 Audit the WSL2 RAPIDS sidecar and existing cuVS/cuGraph clients before any
      native cuVS integration; preserve WSL2 as the proven GPU path until a replacement
      passes parity and lifecycle gates.
- [ ] 0.7 Create `proposal.md`, `design.md`, and behavioral delta specs for this change
      before invoking OpenSpec apply; resolve any design question that changes authority,
      process isolation, ABI ownership, or mutation semantics before implementation.

## 1. Freeze architectural invariants

- [ ] 1.1 Specify `Python skills = internal composition API`, `MCP/ACP/A2A = governed
      external/action transports`, and `ContextToolDagV1/AceSynthesisGraphV1 = authority,
      ordering, mutation, and validation boundary` as non-negotiable invariants.
- [ ] 1.2 Specify `skill != logical lane != algorithm != executor != transport !=
      representation` and require `AlgorithmExecutionManifestV1` to preserve those
      identities independently.
- [ ] 1.3 Specify `operation contract != native implementation`: one stable Atlas
      operation may be implemented by LibTorch, cuBLASLt, cuVS, cuTile, Triton, CPU,
      or another admitted backend without changing the host contract.
- [ ] 1.4 Specify that Python kernel code may nominate candidates, claims, prefill plans,
      subtasks, and file-mutation plans but may never directly write canonical DB state,
      canonical graph state, repository files, or materialized artifacts.
- [ ] 1.5 Specify that canonical mutation requires exact source evidence, revision CAS,
      host policy authorization, mutation lease/worktree isolation where applicable,
      validator success, and a materialization/rollback receipt.
- [ ] 1.6 Specify `LANE != EXECUTOR` for all skill implementations: multiple semantic
      executors do not create multiple semantic RRF votes; multiple graph algorithms are
      graph features/evidence, not automatic independent votes.
- [ ] 1.7 Specify that low-rank, Hilbert, quaternion, spectral, learned, SOM/KMeans, and
      ANN outputs remain derived/routing/rerank/cache hints unless explicitly promoted by
      an exact/proven owner.

## 2. Reconcile `AtlasKernelSessionV1` and host contracts

- [ ] 2.1 Review the existing `atlas-kernel-session.ts` scaffold against the final specs;
      remove fields that duplicate `ContextToolDagV1`, `WorkflowActionEventV1`, ACE, or
      `AlgorithmExecutionManifestV1` ownership.
- [ ] 2.2 Finalize `AtlasKernelSessionV1` identity: `sessionId`, kernel/environment
      revision, Python revision, workspace/graph revisions, loaded skills, artifact
      handles, capabilities, access policy, and producer revision.
- [ ] 2.3 Finalize `AtlasKernelArtifactHandleV1` for Arrow IPC, mmap tensors, JSON,
      MsgPack, Protobuf, and raw-byte artifacts with checksum, representation revision,
      dimensions, byte length, and read-only semantics.
- [ ] 2.4 Finalize `AtlasKernelHostRequestV1` with workflow/DAG identity, bounded resource
      envelope, evidence references, revision guards, and `canonicalWritesRequested=false`.
- [ ] 2.5 Finalize typed kernel responses: `CandidateSetV1`, `ClaimNominationV1`,
      `PrefillCompilationNominationV1`, `AgenticFileMutationPlanV1`, and
      `SubtaskNominationV1`.
- [ ] 2.6 Add schema tests proving kernel responses cannot acquire canonical write
      authority through malformed/extra fields, nested payloads, or response-type
      confusion.
- [ ] 2.7 Add workflow-binding tests proving a request cannot escape its admitted
      session, workspace revision, workflow revision, DAG node, or resource budget.

## 3. `AtlasSkillAdmissionReceiptV1`

- [ ] 3.1 Define `AtlasSkillAdmissionReceiptV1` with `skillName`, import name, skill and
      package revisions, `SKILL.md` checksum, `pyproject.toml` checksum, source/package
      checksum, dependency-lock checksum, declared host requests, and producer revision.
- [ ] 3.2 Record access declarations for network, filesystem, native extensions,
      subprocess execution, GPU libraries, environment variables/secrets, and external
      services; default every undeclared capability to denied.
- [ ] 3.3 Require `lintPassed`, metadata/frontmatter validation, import validation,
      fixture validation, dependency resolution, and host-policy approval before a skill
      becomes installable.
- [ ] 3.4 Add a dependency/SBOM record that distinguishes pure-Python packages from
      native extensions and captures hashes/versions needed to reproduce the kernel
      environment.
- [ ] 3.5 Add static checks for obvious direct-write APIs (`open(...,'w')`, repository
      mutation helpers, direct Postgres/Qdrant/Neo4j write clients, shell mutation
      helpers) as advisory evidence; do not treat static scanning as a security sandbox.
- [ ] 3.6 Add a skill prompt/instruction safety review gate so untrusted `SKILL.md`
      content cannot be auto-admitted merely because the Python package imports.
- [ ] 3.7 Define revocation: changing any admitted skill file, dependency lock, or
      permission declaration invalidates the old admission receipt and requires
      re-admission before the kernel imports the new revision.

## 4. Persistent `AtlasKernelWorker`

- [ ] 4.1 Implement one revisioned persistent IPython/Jupyter kernel worker owned by the
      TypeScript host; do not let individual skills spawn independent unmanaged kernels.
- [ ] 4.2 Inject exactly one authenticated `host.request()` bridge into the kernel and
      make all authoritative Atlas operations flow through that bridge.
- [ ] 4.3 Install only admitted Python-backed skills into a revisioned kernel environment;
      support editable project installs for development but record the exact source and
      dependency revisions in the session receipt.
- [ ] 4.4 Implement progressive skill disclosure: startup exposes concise admitted skill
      metadata; full `SKILL.md` instructions/module help load only when the skill is used.
- [ ] 4.5 Implement kernel startup, health, interrupt, timeout, restart, and stale-session
      invalidation; a restarted kernel must not silently reuse handles from the previous
      environment/session revision.
- [ ] 4.6 Capture stdout/stderr, warnings, exceptions, wall time, CPU time, peak host
      memory, GPU allocation deltas, and output bytes in a bounded kernel-execution
      receipt without persisting hidden reasoning.
- [ ] 4.7 Integrate the existing Python free-thread/GIL capability probe; choose thread,
      process, asyncio, or isolated GPU worker execution from observed runtime/library
      capability rather than assuming free-thread safety.
- [ ] 4.8 Enforce resource budgets for candidates, graph hops, tool calls, output bytes,
      wall-clock deadline, host memory, and GPU reservation; kernel idleness never grants
      mutation authority.
- [ ] 4.9 Add kernel crash/restart tests proving the TypeScript host remains canonical
      and incomplete Python work cannot leave partially materialized canonical state.

## 5. Python-backed skill packaging

- [ ] 5.1 Reconcile `.parent-atlas/skills/semantic-search/` with the final skill contract;
      expose an async callable that requests the semantic capability from the host rather
      than importing a vector-store writer or a fixed executor.
- [ ] 5.2 Reconcile `.parent-atlas/skills/graph-evidence/`; accept canonical IDs/seeds and
      bounded expansion intent while leaving Neo4j/NetworkX/cuGraph/KAG/HyperGraphRAG
      executor selection to the host.
- [ ] 5.3 Reconcile `.parent-atlas/skills/claim-verifier/`; require evidence references and
      return `SUPPORTED | CONTRADICTED | INSUFFICIENT_EVIDENCE` nominations without
      creating canonical facts.
- [ ] 5.4 Reconcile `.parent-atlas/skills/file-repair/`; return only
      `AgenticFileMutationPlanV1` with base checksum, exact evidence, revision-CAS,
      validation, and no-direct-write guarantees.
- [ ] 5.5 Add `compile-prefill` only after the existing ContextManifest/prefill identity
      owner is reconciled; the skill nominates a cacheable prefill plan but does not own
      the canonical cache or model runtime.
- [ ] 5.6 Add `spawn-subtask` only after DAG admission rules are defined; a Python subtask
      nomination becomes a DAG proposal and cannot directly spawn an unbounded agent.
- [ ] 5.7 Create fresh-kernel import/call fixtures for every skill and prove that calling
      each skill produces only the declared typed host request/response surface.
- [ ] 5.8 Add a duplicate-owner test: skills must not contain direct production queries
      that reproduce SearchRuntime, graph-analysis, RRF, exact-promotion, or materializer
      logic already owned by TypeScript/service modules.

## 6. DAG, MCP, ACP, and A2A integration

- [ ] 6.1 Add kernel-request DAG node/action metadata without creating a second workflow
      engine; reuse `ContextToolDagV1`/`WorkflowActionEventV1` and the existing LangGraph
      execution owner.
- [ ] 6.2 Require an admitted skill invocation to bind to a specific DAG node and produce
      an `AlgorithmExecutionManifestV1`/kernel receipt that identifies skill revision,
      host request kind, algorithm, executor, transport, and representations actually used.
- [ ] 6.3 Route external side effects through existing MCP/ACP/A2A adapters instead of
      exposing every Qdrant/cuVS/cuGraph/analyzer primitive as a model-facing tool.
- [ ] 6.4 Require `EXACT_PROMOTION` ancestry before any tool/action that depends on exact
      source or semantic evidence.
- [ ] 6.5 Require every mutating `AgenticFileMutationPlanV1` to become a host-authorized
      DAG mutation node followed by validator and materializer/rollback nodes.
- [ ] 6.6 Add denial tests: Python cannot bypass tool approval by emitting a crafted
      `WorkflowActionEventV1`, invoking an MCP endpoint directly, or inventing a DAG node.
- [ ] 6.7 Add an end-to-end read-only proof:
      `semantic_search -> graph_evidence -> claim_verifier -> ContextManifest` with no
      canonical writes and revision-qualified evidence throughout.
- [ ] 6.8 Add an end-to-end mutation proof:
      `semantic_search -> graph_evidence -> claim_verifier -> file_repair -> DAG ->
      validator -> materializer`, proving the Python side stops at the mutation plan.

## 7. Artifact, Arrow/mmap, and ACE residency integration

- [ ] 7.1 Reuse the existing ACE/BitFrost/residency owners for artifact placement; kernel
      handles reference resident data but do not become another cache manager.
- [ ] 7.2 Define canonical artifact-handle compatibility for `semantic_768`, PCA/latent
      projections, candidate feature matrices, graph snapshots, hypergraph incidence,
      source cards, and compact top-K artifacts.
- [ ] 7.3 Prefer Arrow IPC/mmap or stable binary handles for large matrices; prohibit
      repeatedly embedding 768-float vectors or large graph payloads in JSON host messages.
- [ ] 7.4 Validate handle checksums and representation/workspace/graph revisions before a
      Python skill can map/read an artifact.
- [ ] 7.5 Add stale-handle rejection and fail-open re-fetch/recompute behavior; stale cache
      data must never silently satisfy exact-promotion or mutation evidence gates.
- [ ] 7.6 Record transfer/recompute cost so ACE can choose VRAM, pinned RAM, host RAM,
      Valkey, Qdrant/Postgres, or disk residency without changing skill semantics.

## 8. Executor registry behind skills

- [ ] 8.1 Add a host-side capability/executor registry that maps semantic search to the
      existing exact/ANN executors (Qdrant/canonical exact, cuVS brute force, CAGRA,
      TurboVec/DiskANN challengers where admitted) without changing the semantic lane.
- [ ] 8.2 Map graph evidence to the existing structural owners and executor choices
      (Postgres/Neo4j/NetworkX/cuGraph/KAG/n-ary hypergraph) while preserving canonical
      relation provenance.
- [ ] 8.3 Map dense projections/rerank feature math to PyTorch/cuBLASLt/custom-kernel
      challengers only after numerical parity; keep CrossEncoder/model inference as a
      distinct neural executor.
- [ ] 8.4 Keep BM25, BM42 experimental, Postgres FTS/trigram, and legacy sparse codecs as
      separately identified lexical signals under one logical lexical vote group.
- [ ] 8.5 Require executor selection to consume the existing resource envelope and
      residency state; a skill name must never hard-code the current preferred GPU/CPU
      executor.
- [ ] 8.6 Emit one execution receipt per actual executor call including implementation
      revision, device/backend, transport, latency, bytes moved, cache status, and
      fallback reason.

## 9. Freeze `AtlasNativeCAbiV1`

- [ ] 9.1 Define a standalone public C header for the long-lived Atlas native ABI; keep it
      independent of Node/V8/N-API, LibTorch/ATen/c10, CUDA runtime/driver handle types,
      C++ STL containers, exceptions, and implementation-specific classes.
- [ ] 9.2 Add `atlas_get_abi_version()` plus ABI-major/minor compatibility rules and a
      function-table/capability discovery API so loaders can reject incompatible backends
      before executing math.
- [ ] 9.3 Define versioned POD structs with `struct_size` and `abi_version`, including
      `AtlasConfigV1`, `AtlasTensorViewV1`, `AtlasTopKOutputV1`, status/error records,
      and opaque `AtlasContext`/artifact/index handles.
- [ ] 9.4 Define stable integer enums for status, dtype, memory device, layout, operation,
      flags, and capability bits; document append-only struct-evolution rules.
- [ ] 9.5 Ban `std::string`, `std::vector`, `std::span`, `std::exception`, `torch::Tensor`,
      `at::Tensor`, `c10::*`, `cudaStream_t`, `cudaEvent_t`, `CUcontext`, `napi_value`,
      V8 handles, or compiler-owned C++ objects from the public ABI.
- [ ] 9.6 Make caller-allocated input/output buffers the default ownership model; where
      backend allocation is unavoidable, pair creation/release functions and require the
      creator backend to free its own allocations.
- [ ] 9.7 Define tensor lifetime/alignment/contiguity/stride semantics and explicit host
      vs device pointer rules; reject ambiguous raw pointers rather than guessing ownership.
- [ ] 9.8 Add ABI header tests for C compilation, C++ inclusion, struct sizes/offsets,
      symbol visibility, and backward-compatible loading across at least two backend builds.

## 10. Thin Node-API adapter (`atlas_native.node`)

- [ ] 10.1 Refactor toward a thin Node-API adapter that depends only on Node-API plus the
      Atlas C ABI; do not let the final adapter link directly against LibTorch/cuVS/CUDA
      implementation libraries when a backend DLL/shared object can own them.
- [ ] 10.2 Preserve Node-API as the JavaScript ABI boundary and treat external native
      library ABI compatibility as a separate problem rather than assuming Node-API makes
      LibTorch/cuVS dependencies stable.
- [ ] 10.3 Move existing `simd-bridge/cpp/binding.cc` operation implementations behind
      Atlas backend functions incrementally; do not big-bang rewrite the working addon.
- [ ] 10.4 Implement TypeScript/Node wrappers for C-ABI status/error handling without
      exposing backend pointers or C++ exceptions to JavaScript.
- [ ] 10.5 Preserve/verify current ArrayBuffer/tensor-lifetime pooling behavior or replace
      it with an explicitly owned buffer strategy that passes GC, worker-thread, and
      backend-unload stress tests.
- [ ] 10.6 Add fallback routing so failure to load an optional native backend degrades to
      an already-proven service/Python/CPU path instead of making application startup fail.

## 11. Runtime backend loading and Windows DLL hardening

- [ ] 11.1 Define a versioned native backend package layout, e.g.
      `native/backends/<backend-id>/atlas_backend.{dll|so}` plus a checksum/capability
      manifest and backend-owned dependency directory.
- [ ] 11.2 On Windows, replace broad `PATH` mutation with an explicit absolute backend
      directory and controlled `SetDefaultDllDirectories`/`AddDllDirectory`/
      `LoadLibraryEx` search policy where supported.
- [ ] 11.3 Load only the selected backend by absolute/full path and resolve the Atlas ABI
      function table through `GetProcAddress`; reject missing mandatory symbols before
      creating an `AtlasContext`.
- [ ] 11.4 Record backend ID, Atlas ABI version, compiler/runtime, library revisions,
      CUDA/cuDNN revisions, compute capability, exported capabilities, and binary checksum
      in `AtlasNativeBackendReceiptV1`.
- [ ] 11.5 Ensure unload/reload is blocked while backend-owned contexts/buffers/operations
      remain live; add deterministic lifecycle/refcount tests.
- [ ] 11.6 Test missing DLL, wrong ABI major, missing symbol, checksum mismatch, incompatible
      CUDA runtime, and dependency-search failure as distinct typed errors.
- [ ] 11.7 Keep cuVS/RAPIDS Linux/WSL2 packaging separate from Windows-native LibTorch
      packaging unless a supported native-Windows cuVS path is proven; do not force one
      loader model across unsupported platforms.

## 12. LibTorch backend implementation

- [ ] 12.1 Build `atlas_backend_libtorch_<revision>` behind `AtlasNativeCAbiV1`; keep all
      `torch::Tensor`/ATen/c10/LibTorch objects strictly inside the backend.
- [ ] 12.2 Implement `atlas_batch_cosine_topk_v1` using caller-owned tensor views and
      outputs: validate shapes/dtypes, wrap/copy safely, normalize, execute GEMV/GEMM,
      select top-K, and return only scores/ordinals through the C ABI.
- [ ] 12.3 Implement CPU reference parity for cosine/top-K and establish deterministic
      canonical tie ordering outside backend-specific unstable `topk` tie order.
- [ ] 12.4 Add device/resource context creation with explicit CUDA availability,
      compute-capability, stream policy internal to the backend, and typed failure status.
- [ ] 12.5 Package LibTorch/CUDA/cuDNN dependencies with a backend manifest so upgrading
      LibTorch produces a new backend package rather than a new Node-facing ABI.
- [ ] 12.6 Prove numerical parity and lifetime safety for LibTorch backend operations
      before replacing any current native operation owner.

## 13. LibTorch Stable ABI as an optional backend optimization

- [ ] 13.1 After `AtlasNativeCAbiV1` is frozen and proven, inventory which backend
      operations fit PyTorch's stable LibTorch subset and which still require ordinary
      version-specific ATen/LibTorch APIs.
- [ ] 13.2 Build one experimental stable-ABI backend using `torch::stable::*` and the
      supported `TORCH_TARGET_VERSION` mechanism; keep it behind the same Atlas C ABI.
- [ ] 13.3 Verify the stable backend across at least two compatible PyTorch releases;
      compare numerical results, startup/load behavior, performance, and binary size.
- [ ] 13.4 Treat failure to fit the stable subset as a packaging/rebuild cost only; never
      weaken or redesign `AtlasNativeCAbiV1` merely to satisfy PyTorch stable-ABI coverage.

## 14. Alternate native/GPU backends

- [ ] 14.1 Implement a cuBLASLt-backed dense cosine/GEMM challenger only after the
      LibTorch/CPU operation contract and parity corpus are frozen.
- [ ] 14.2 Evaluate a cuTile/Triton/CUTLASS implementation for compact top-K preparation,
      low-rank projection, ALT reduction, quaternion batches, or fused feature epilogues;
      promote only measured hot paths.
- [ ] 14.3 Where binary integration is preferable to service calls, use NVIDIA cuVS's
      stable C ABI rather than binding the C++ API directly; preserve cuVS ABI-major
      compatibility rules in backend receipts.
- [ ] 14.4 Keep cuGraph/cuDF/cuSPARSE algorithms behind the existing RAPIDS/WSL2 worker or
      a separately versioned C/service backend; do not leak RAPIDS Python/C++ types across
      the Atlas native ABI.
- [ ] 14.5 Add backend parity matrices showing operation contract, supported dtype/device,
      exact/approximate semantics, deterministic claim, latency, throughput, VRAM, and
      fallback behavior.

## 15. Prefill, model runtime, and cache nominations

- [ ] 15.1 Reuse the existing ContextManifest owner to build prefill identity from
      ContextManifest checksum + model revision + adapter revision + prompt-template
      revision + evidence revisions; do not checksum arbitrary serialized protobuf bytes
      as a long-term canonical identity.
- [ ] 15.2 Let Python `compile_prefill` nominate a prefill/cache artifact only; the host
      validates revisions, resource policy, model runtime, and cache eligibility.
- [ ] 15.3 Keep llama-server, PyTorch/Inductor/Triton, and TensorRT-LLM runtime identities
      separate from the Python skill interface and record the backend actually selected.
- [ ] 15.4 For hybrid Ornith-style sequence models, keep recurrent-state and full-attention
      KV-cache residency accounting separate in the resource policy.
- [ ] 15.5 Add cache invalidation tests proving a change in model, adapter, prompt template,
      exact evidence, or representation revision prevents stale prefill reuse.

## 16. Policy, DSPy/RL, and orchestration boundaries

- [ ] 16.1 Keep deterministic DAG legality, mutation authorization, exact promotion, and
      resource hard limits outside DSPy/RL/LLM control.
- [ ] 16.2 Permit DSPy/GEPA to optimize skill/program selection only inside an already
      legal host action set; require held-out evaluation and a revisioned policy receipt.
- [ ] 16.3 Permit PyTorch policy/RL experiments to learn expected utility/cost from
      `WorkflowActionEventV1` + `ExecutionReceiptV1` history only after packet/action-level
      outcome attribution is populated and validated.
- [ ] 16.4 Keep HMM/Viterbi experiments as optional sequence-policy helpers inside the
      DAG; they may rank/navigate legal next actions but cannot replace the DAG or authorize
      MCP mutations.
- [ ] 16.5 Record policy revision and all chosen executor/skill actions so later learning
      can distinguish policy effects from retrieval/model/backend effects.

## 17. Execution identity and receipts

- [ ] 17.1 Extend `AlgorithmExecutionManifestV1` or add a linked kernel receipt so every
      skill call answers: skill revision, representation/geometry, algorithm, executor,
      device, model/router, serialization/parser, transport, cache/residency state, and
      exact/approximate role.
- [ ] 17.2 Define `AtlasKernelExecutionReceiptV1` with request/session/workflow identity,
      input/output artifact checksums, resource usage, host calls, fallback/degradation,
      warnings/errors, and producer revision.
- [ ] 17.3 Define `AtlasNativeBackendReceiptV1` and link it to execution manifests for
      native operations so a receipt can distinguish `CUBLASLT`, `LIBTORCH`, `CUVS`,
      `CUTILE`, or fallback execution under one operation contract.
- [ ] 17.4 Join validation/materialization outcomes back to action/kernel receipts without
      persisting private chain-of-thought or untyped notebook state.
- [ ] 17.5 Add deterministic canonical-JSON/hash rules for receipt identity and Merkle-like
      lineage; hashes provide integrity/lineage, never semantic relevance.

## 18. Security and trust hardening

- [ ] 18.1 Document that persistent Python is not a security sandbox; model/kernel code
      executes with worker OS permissions unless process/OS isolation separately constrains it.
- [ ] 18.2 Run the kernel under the least-privileged practical user/process identity and
      evaluate OS/process isolation (Windows Job Object/restricted token and/or WSL/container
      worker) without making unproven sandbox claims.
- [ ] 18.3 Disable network access by default for skills; create an explicit allowlisted
      host/service request path for skills that genuinely require external network data.
- [ ] 18.4 Prevent skill packages from receiving production DB credentials or repository
      write tokens directly; inject only short-lived/least-privilege host capability handles.
- [ ] 18.5 Add dependency provenance/checksum verification and a review workflow for
      third-party skills before admission; never auto-install arbitrary public skill folders.
- [ ] 18.6 Add adversarial fixtures for malicious `SKILL.md`, dependency confusion,
      subprocess escape attempts, direct filesystem mutation, forged host requests, oversized
      outputs, infinite loops, and GPU/host-memory exhaustion.
- [ ] 18.7 Verify host-side revision/CAS/validator controls still prevent canonical mutation
      even when the kernel process is treated as fully compromised.

## 19. Test and proof ladder

- [ ] 19.1 Run targeted TypeScript typecheck/Vitest for kernel contracts, skill admission,
      DAG binding, execution manifests, and native backend schemas; record exact commands
      and results in a proof report.
- [ ] 19.2 Create a fresh Python environment/kernel fixture that installs only admitted
      skills and proves each import/call contract without relying on an already-warm developer
      environment.
- [ ] 19.3 Prove `semantic_search -> graph_evidence -> claim_verifier` against frozen
      fixture data and then against one live read-only revision, preserving canonical IDs and
      evidence lineage.
- [ ] 19.4 Prove `file_repair` cannot write a file directly, then prove the host can accept
      the same plan through CAS + validator + materializer on an isolated test worktree.
- [ ] 19.5 Add kernel restart, timeout, cancellation, duplicate-request, stale-artifact,
      stale-session, and host-unavailable recovery tests.
- [ ] 19.6 Build/load two Atlas native backend revisions against one unchanged Node-API
      adapter and prove ABI negotiation, operation parity, and typed rejection of an
      incompatible ABI major.
- [ ] 19.7 Stress allocator/tensor lifetime across GC, worker threads, repeated native calls,
      backend reload attempts, and process shutdown; no cross-DLL allocator free is allowed.
- [ ] 19.8 Run CPU reference <-> LibTorch <-> cuBLASLt/cuVS/custom-kernel numerical parity
      for each native operation before any challenger is promoted.
- [ ] 19.9 Run resource-envelope stress tests under VRAM pressure and verify ACE/offload/
      fallback choices do not change canonical semantics.
- [ ] 19.10 Produce one complete receipt chain from query -> skill -> host request -> executor
      -> exact promotion -> ContextManifest -> MCP/DAG action -> validation -> materialization.

## 20. Rollout and ownership migration

- [ ] 20.1 Stage kernel/skills as read-only shadow capability first; existing production
      SearchRuntime/DAG/MCP/native owners remain authoritative during comparison.
- [ ] 20.2 Require a frozen replay corpus and two-run determinism/lineage proof before
      promoting any skill path to an active model-facing capability.
- [ ] 20.3 Promote one capability at a time (`semantic_search`, then graph evidence, then
      claim verification, then mutation-plan nomination) and keep a feature flag/rollback path.
- [ ] 20.4 Do not remove low-level MCP/tools or current Node native exports until usage
      traces prove the higher-level skill/ABI path covers their required behavior and a rollback
      release exists.
- [ ] 20.5 After the thin Node-API/C-ABI backend split is proven, classify old monolithic
      bridge exports as retained compatibility, deprecated, or removable; archive rather than
      delete proof scripts and migration evidence.
- [ ] 20.6 Only after all authority and proof gates pass, update architecture docs/OpenSpec
      specs to declare the governed kernel and Atlas C ABI as live owners.

## 21. Long-term experiments — explicitly blocked on core proof

- [ ] 21.1 Evaluate persistent free-threaded Python only after imported scientific/GPU
      extensions are verified not to silently re-enable the GIL or introduce unsafe concurrency.
- [ ] 21.2 Evaluate skill-generation/refinement from successful trajectories only through
      the same admission/review pipeline; self-authored skills do not receive automatic trust.
- [ ] 21.3 Evaluate CUDA Graph capture/replay for repeatedly selected fixed-shape native
      operation sequences after execution identity and tensor lifetimes are stable.
- [ ] 21.4 Evaluate a stable-ABI cuVS/native in-process path versus the existing WSL2 service
      path only when deployment/latency measurements justify the added lifecycle complexity.
- [ ] 21.5 Evaluate Rust/C++ sidecars for CPU-bound or isolation-sensitive operations only
      behind the same host contracts; implementation language must not change model-facing skills.
- [ ] 21.6 Evaluate automatic backend autotuning and hardware-response surfaces only with
      target-hardware receipts; never promote Blackwell-tuned launch parameters as 3060-Ti
      execution policy without target-GPU measurement.

## 22. Final acceptance gates

- [ ] 22.1 `KERNEL_NO_CANONICAL_WRITES`: a hostile/misbehaving kernel cannot perform a
      canonical mutation without going through host authorization and validation.
- [ ] 22.2 `SKILL_ADMISSION_REPRODUCIBLE`: an admitted skill revision can be rebuilt in a
      clean kernel environment from its recorded source/dependency checksums.
- [ ] 22.3 `SKILL_SURFACE_SMALL`: the model can compose the core workflow through a small
      higher-level Python skill surface without exposure to every low-level executor/tool.
- [ ] 22.4 `DAG_REMAINS_AUTHORITY`: MCP/ACP/A2A actions, mutation ordering, retries,
      validation, rollback, and materialization remain owned by the authoritative DAG.
- [ ] 22.5 `NATIVE_C_ABI_STABLE`: one unchanged Node-API adapter successfully loads at least
      two compatible backend implementations and rejects an incompatible ABI safely.
- [ ] 22.6 `NO_CPP_TYPES_ACROSS_ABI`: automated header/export inspection finds no forbidden
      C++/LibTorch/CUDA/Node implementation types in the public Atlas C ABI.
- [ ] 22.7 `CALLER_OWNED_MEMORY_PROVEN`: native allocation/lifetime tests show no allocator
      ownership crosses incompatible DLL/runtime boundaries.
- [ ] 22.8 `EXECUTION_IDENTITY_COMPLETE`: every live skill/native/backend call can answer
      what representation, algorithm, executor, backend/device, transport, revision, and cache/
      residency state actually ran.
- [ ] 22.9 `EXACT_PROMOTION_PRESERVED`: Python skills, ANN/low-rank/GPU challengers, and
      caches cannot bypass the existing exact-evidence promotion gates.
- [ ] 22.10 `ROLLBACK_PROVEN`: disabling the governed kernel/native backend path restores the
      previous proven production owners without data migration or canonical-state repair.
