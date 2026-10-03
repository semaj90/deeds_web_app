# Parent Atlas Native Dawn Viewer Contract v1

Status: `DESIGN_ONLY_NOT_IMPLEMENTED`

## Purpose

Define a native WebGPU visualization client without making it a retrieval,
identity, or persistence authority. The intended executable is
`atlas_dawn_viewer.exe`; it is a separate consumer of the Parent Atlas core and
revision-qualified projection payloads.

## Target boundary

```text
atlas_dawn_viewer.exe
  ├─ Dawn / webgpu.h backend (Windows D3D12 initially)
  ├─ presentation and visualization code
  └─ atlas_core.dll C ABI client

tensorrt_bridge.node
  └─ remains a separate Node/N-API target; never links the Dawn viewer
```

The viewer may render bounded layouts, heatmaps, and graph/projection
exploration. GPU rendering or client-side filtering does not promote a result,
change a score's authority, or replace server-side workspace/revision checks.

## Input and authority rules

- Inputs are read-only projection payloads from an explicitly selected service
  or fixture. The viewer does not connect directly to PostgreSQL, Qdrant,
  Valkey/Redis, Neo4j, or object storage.
- Every displayed projection is labeled with its workspace revision,
  representation/graph revision where applicable, and execution receipt or
  source reference supplied by its producer.
- Missing or mismatched revision metadata is displayed as unverified and is
  not silently filled from a current or `latest` value.
- Candidate ordinals and GPU row indices are presentation coordinates only;
  canonical IDs and source references remain separate fields.
- The viewer performs no durable writes, cache warming, packet admission,
  retrieval fusion, or canonical identity resolution.

## Core ABI relationship

`atlas_core.dll` is consumed through the public versioned C ABI only. The viewer
must validate ABI/version and buffer ownership before reading a payload, and
must release each allocated buffer through the allocator paired with that
buffer. The current core's contract/fixture proof does not imply that projection
or compute operations are implemented; the viewer must show an explicit
unavailable state when a required operation is not implemented.

## Build and dependency gates

- Dawn is an optional, separately versioned build dependency of the viewer
  target; it is not a dependency of `atlas_core` or `tensorrt_bridge.node`.
- A viewer build must be independently configurable and testable without the
  Node addon. The core-only build must remain possible when Dawn is absent.
- Platform-specific backend selection and capability are reported as runtime
  metadata; a successful executable build is not proof of WebGPU device
  availability or rendering correctness.
- Any remote projection transport remains behind a typed service client. The
  proposed `AtlasVectorService` is not available until its separate protobuf /
  service task is implemented and validated; this contract does not invent an
  endpoint or RPC method.

## Verification required before implementation is called complete

1. Configure/build `atlas_core` with Dawn disabled.
2. Configure/build the independent viewer target with Dawn enabled on a
   supported Windows toolchain.
3. Verify the viewer's dependency graph excludes `tensorrt_bridge.node` and
   store clients.
4. Render a bounded fixture carrying explicit revision metadata; reject a
   mismatched revision fixture and report unavailable capabilities distinctly.

Current status is design-only. No Dawn dependency, executable, RPC, store
connection, or rendering proof is claimed.
