## ADDED Requirements

### Requirement: TensorRT-RTX is a separate challenger executor lane
The system SHALL treat TensorRT-RTX on a CUDA 13.4 host toolchain as an inference executor lane that is separate from `atlas-gpu-8098` (RAPIDS) and `atlas-neural-decoder` (PyTorch). It SHALL NOT own retrieval, identity, or canonical ranking authority.

#### Scenario: RAPIDS and PyTorch environments are unchanged by the lane
- **WHEN** the CUDA 13.4 host toolchain or TensorRT-RTX is installed
- **THEN** the admitted `atlas-gpu-8098` and `atlas-neural-decoder` environments are not rebuilt or upgraded as part of that step

### Requirement: Version-bound engines and caches
The system SHALL rebuild TensorRT-RTX engines and runtime caches whenever the TensorRT-RTX version, CUDA toolkit version, or GPU SKU changes, and SHALL NOT reuse prior receipts across such a change.

#### Scenario: Old receipts are not reused
- **WHEN** TensorRT-RTX is moved to a new runtime version
- **THEN** prior engine and cache receipts are marked superseded and the engine-build and deserialize proofs are re-run

### Requirement: Proof ladder before the lane is claimed proven
The system SHALL NOT report the lane as `TENSORRT_RTX_CUDA134_PROVEN` until driver capability, side-by-side toolkit install, SM_86 capability probe, tiny ONNX engine build, engine deserialize plus inference, and runtime-cache rebuild/readback have each produced a receipt.

#### Scenario: A skipped step blocks the claim
- **WHEN** any ladder step lacks a receipt
- **THEN** the lane status remains NOT_PROVEN
