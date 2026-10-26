# `atlas-corpus-lib` (`0.1.0`)

Versioned in-repository Python contracts and proposal helpers with a CMake-built pybind11 extension. Build or install in an environment with CMake, a C++20 compiler, and the pinned pybind11 build dependency; the runtime Pydantic dependency must be present when using `--no-deps`.

## Implemented

- Strict structural observation models separate UTF-8 source byte spans from UTF-16 LSP ranges, require repository-relative `source_ref == file_path`, and mark outputs `PROPOSAL_ONLY`.
- `build_source_bound_observation_from_8095_chunk` consumes the existing `atlas.ast.evidence.v1` response shape, checks `file_path`, source revision, parser-byte receipt, and span against caller-supplied snapshot bytes, and preserves parser completeness metadata as proposal-only evidence.
- The 8095 adapter accepts an explicitly supplied taxonomy binding and a separately typed LSP symbol observation; the versioned AST index payload preserves source/path revisions, parser language, taxonomy label, UTF-8 byte span, UTF-16 LSP range, and parser completeness without promoting authority.
- The lower-level `build_source_bound_structural_observation` binds a supplied span to exact UTF-8 bytes and computes SHA-256; it does not parse source or infer language.
- RFC/domain routing accepts a caller-supplied route registry; its deterministic FSM honors the `detect` trigger and NUL stop and returns proposal observations.
- Source-reference reconciliation accepts only one exact SHA-256 binding. It does not infer identity from a path or fabricate UUIDs.
- TurboVec 128-value 2-bit/4-bit packer emits 32/64-byte proposal payloads, base encodings, and a digest. The Python bit order and L2 prefix normalization match `packages/atlas-native-core`.
- Native C++, pybind11, Node-API, and Python expose high-bit-first asymmetric 2-bit and 4-bit dot scoring. The 4-bit contract is `minimum + nibble * scale_4bit`, with the high nibble scoring the even coordinate; malformed lengths, negative/non-finite scales, and non-finite query values are rejected. These are CPU reference scores, not CUDA kernels or canonical retrieval ranking.
- `unpack_pgvector_binary_768` validates the pgvector binary dimension/reserved header and exact 3,076-byte length, decodes big-endian float32 values, and rejects non-finite components. It is a pure decoder; it neither opens database connections nor establishes packet/source lineage.
- Node-API TurboVec packing writes directly into Node-owned `Buffer` storage through the caller-runtime output pointers; the 2-bit, 4-bit, and sign-bit buffers retain their storage through the normal Node buffer lifetime without an intermediate C++ result-array copy. The 128-byte LOD assembler now serializes directly into a 64-byte-aligned external Node buffer whose owner is released by the Node finalizer. The transform still creates output bytes; this removes the extra post-serialization copy and is not zero-copy from the input Float32Array.
- The native pybind and Node-API bindings expose `assemble_lod_texture_block_v1` / `assembleLodTextureBlockV1`, respectively. Both call the C++ serializer and emit the same explicit little-endian 128-byte proposal block; these APIs do not persist data or confer canonical packet identity.
- `build_lod_tile_arrow_record_v1` and `encode_lod_tiles_arrow_ipc` carry that block with the full validated AST payload, required feature/taxonomy binding, and source/workspace revisions. The bounded (4,096-record / 64 MiB) deterministic IPC reader verifies schema, ordinal ordering, metadata agreement, and each block digest; this is a proposal artifact, not a database writer.
- `decode_lod_tiles_arrow_to_cpu_tensor_v1` preserves the sorted record list beside the `[N,128]` CPU `uint8` tensor and checks that tensor row bytes match each ordinal-bound tile. It does not transfer to CUDA or claim zero-copy from Arrow storage.
- Arrow metadata also seals `CandidateOrdinalMapV1`: sorted ordinals bind to packet key when supplied, source reference/revision, symbol name, and exact byte span. Readback recomputes and verifies the map digest before tensor staging.
- CPU reference radix ordering, interpolation, frozen SVD/SOM recommendation, bounded JSONL iteration, and descriptor-only kernel cache metadata. JSONL reads are capped at 4,096 rows, 1 MiB per row, and 64 MiB per batch; duplicate object keys and non-standard numeric constants are rejected. `SomSvdModelManifestV1` binds the training-corpus revision and hashes of the float32 mean, basis, and 20x20 codebook; recommendations verify those arrays and resolve their candidate ordinal against a validated `CandidateOrdinalMapV1`, returning the map entry's source identity and span. These results remain derived proposals.
- QLoRA corpus validation requires human-reviewed labels and a 200-row / 30-per-grade floor before deterministic JSONL or optional Arrow IPC export. Arrow export is available with `pip install --no-deps -e ".[arrow]"` after the pinned PyArrow dependency is present. It does not train or emit ATen checkpoints.
- LOD block batching makes one explicit coalescing copy into a bounded staging buffer, then exposes a Torch `uint8` tensor or NumPy view. The adapter does not claim zero-copy from the original block objects, CUDA residency, or a LibTorch ABI.

## Not implemented or not proven

- Tree-sitter/AST-grep query execution and source-byte extraction are not implemented by this package; 8095 remains the structural observation owner.
- The JSONL loader is CPU JSON parsing or optional cuDF DataFrame loading. Optional Arrow IPC export is not a JSONL loader fallback and does not prove GPU kernel execution.
- SVD/SOM and interpolation are CPU reference helpers; their manifests establish artifact integrity, not trained-model quality, a CUDA/cuTile kernel, or live RTX acceleration.
- No PostgreSQL, Qdrant, Neo4j, NetworkX, or LangExtract writes/callers are included. Fanout remains outside this package.
- The C++ core has optional CMake builds for pybind11, Node-API 8, and a PyTorch-linked ATen bridge. The ATen build queries the selected Python interpreter for Torch include/library paths and `_GLIBCXX_USE_CXX11_ABI`, then proves a CPU `torch::from_blob` view over 64-byte-aligned LOD blocks with shared-owner lifetime. This does not prove CUDA transfer, cuTile execution, or a packaged Windows `.node` artifact.
- The default Python wheel contains the pybind11 core only. Set `ATLAS_NATIVE_BUILD_ATEN=ON` while building the wheel inside the intended PyTorch environment to also package `_atlas_aten_bridge`; this opt-in build uses that interpreter's Torch ABI and does not bundle or install PyTorch.
- The `atlas-corpus-lib` wheel builds and includes `_atlas_native_core` from `packages/atlas-native-core`; source-tree imports expose `native_core=None` if the extension has not been built.
- `TensorTileV1` is frozen in `proto/active/tensor_tile_v1.proto` and has C++/protobufjs and C++/Python byte-parity fixtures. The separate Python `LodTexturePacketEnvelopeV1` 20-field writer has no matching message in `turbovec.proto` or `tensor_tile_v1.proto`; do not treat it as interoperable transport until its schema owner is established and verified.

## Validation

From repository root, run the focused Python tests with the supported environment:

```powershell
wsl -d Ubuntu -u james -- env PYTHONPATH=/mnt/c/Users/james/Videos/deeds-web-app/python/atlas_corpus_lib /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python -m unittest discover -s /mnt/c/Users/james/Videos/deeds-web-app/python/atlas_corpus_lib/tests -v
```

Build and run the C++20 core tests with CMake. Enable `ATLAS_NATIVE_BUILD_PYTHON` and pass `ATLAS_PYBIND11_INCLUDE_DIR` to build/test pybind; enable `ATLAS_NATIVE_BUILD_NAPI` and pass `ATLAS_NODE_ADDON_API_INCLUDE_DIR` plus `ATLAS_NODE_API_INCLUDE_DIR` to build/test the Node-API module (Windows builds also link the matching Node `node.lib` import library); enable `ATLAS_NATIVE_BUILD_ATEN` and set `Python3_EXECUTABLE` to the target PyTorch environment to build/test the ATen bridge.
