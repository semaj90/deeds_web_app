# LibTorch PCA projection precision reference

Status: design/reference only. No FP16 or INT8 PCA executor is wired or qualified by this note.

## Existing path

`topology-projection.ts::pcaProjectJson` parses numeric JSON into a bounded FP32 matrix and delegates to the existing PCA projection owner. The SIMDJSON bridge accelerates JSON parsing; it is not LibTorch and does not itself create tensor storage or GPU execution. The current projection contract is FP32 input/output unless the native owner says otherwise.

The canonical `semantic_768` representation remains the PostgreSQL-owned FP32 representation. Reduced-precision PCA outputs are derived, revision-bound candidates, not replacements for canonical embeddings.

## LibTorch boundary

The official PyTorch C++ frontend is a C++17 tensor API for CPU/GPU computation and includes `torch::Tensor`; LibTorch is therefore a suitable existing native execution surface. This does not imply that the current addon supports every dtype or that a JSON-to-tensor path is zero-copy. The current bridge must prove dtype, layout, ownership, and lifetime per operation.

FP16 can be evaluated as a storage/execution challenger after FP32 parity is locked. INT8 requires an explicit quantization contract (calibration scope, scale, zero point, clipping, and dequantized comparison); generic PyTorch INT8 model quantization documentation is not evidence that PCA projection itself is implemented or accelerated in this addon.

## Proposal artifact

`.okf/schemas/pca-projection-experiment-v1.schema.json` describes a non-authoritative receipt. It binds the projection to source snapshot and ordinal checksums, PCA mean/components digests, output dtype/shape/length, and output digest. INT8 additionally requires the quantization scale, zero point, and calibration checksum. Only a measured FP32 comparison may mark a candidate `VALIDATED`; that label remains experiment validation, not canonical promotion.

Required comparisons use the same frozen rows, projection parameters, and ordinal map. Record maximum absolute error, MSE, retrieval Recall@K, artifact bytes, and CPU/GPU executor details. Reject non-finite output, checksum mismatch, row-order mismatch, and failed thresholds. Keep source identity and canonical `semantic_768` untouched.

## PostgreSQL status

The existing `0152_atlas_representations_registry.sql` already allows `f16` and `int8` quantization labels, but it is not currently reflected in the inspected Drizzle schema or migration journal. Do not create a second representation table or apply this broad registry migration as part of a PCA experiment. First reconcile migration ownership/registration, Drizzle parity, existing live schema, and the registry's intended authority; then prepare a separately reviewed migration plan if needed. No database query or write is performed by this reference.

## Documentation sources

- [PyTorch C++ frontend](https://docs.pytorch.org/cppdocs/frontend)
- [PyTorch C++ API reference](https://docs.pytorch.org/cppdocs/api/index.html)
- [PyTorch INT8 quantization overview](https://docs.pytorch.org/blog/int8-quantization/)

Firecrawl was used to extract the official documentation for review. A separate BeautifulSoup pass was unnecessary: the extracted Markdown was sufficient for this short, linked summary. No upstream documentation was copied verbatim into the repository.
