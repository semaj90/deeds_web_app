# Packet/Chunk Mapping Audit

Generated: 2026-09-05T05:57:50.508Z
Status: WARN

## Summary

- Atlas packets: 61,715
- Codebase chunks: 55,853
- Exact source_ref matches: 91,713
- packet_key matches: 0
- feature_id matches: 0
- tree_node_id matches: 0
- qdrant_id matches: 1,280
- ambiguous mappings: 35,956
- unmapped packets: 54,118
- chunks mapped to multiple packets: 35,956
- packets mapped to multiple chunks: 7,151
- empty-path rows: 37
- invalid source refs: 37

## Samples

### Empty-path rows
```json
[
  {
    "id": "226a0905-8bc8-4035-b3c0-6e150224d825",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "3cb3e712-bf79-6b00-10af-292143c8629a"
  },
  {
    "id": "0e807030-12f0-4473-a5fc-40cfaacab380",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "32517993-9ff6-96a7-5cdd-1c7ab69aa9af"
  },
  {
    "id": "3e525552-9a5a-47f6-90b1-b9127f9ee668",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "1dbaf674-742b-639c-0f78-07cbc3b1687c"
  },
  {
    "id": "ae0f2a4e-a7ae-41a1-bce3-ba072e597376",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "32ad21dd-037e-48c4-10ad-7d51bf805999"
  },
  {
    "id": "ed8bfb24-62ab-42f9-a570-de3c157224ac",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "0ca1bc2e-b6f5-cb0e-987b-d345a21eeca2"
  },
  {
    "id": "979b1a34-b719-4dd2-85b0-1f794a62740d",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "3153980c-d6ba-1072-8ffe-969d90c3758f"
  },
  {
    "id": "e1971097-bb04-4146-a1d2-e89bfe4a2dc7",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "1d606307-3811-acda-1616-93b980975a8e"
  },
  {
    "id": "93429a7d-dd18-4432-8db0-0728b185a407",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "40d1e02f-6715-7dcc-9a00-11cd432aeeff"
  },
  {
    "id": "ee336e6f-be09-43d6-9f67-8c6fceda4bc6",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "103d360e-4e47-afd1-e2c8-6d7acca8e861"
  },
  {
    "id": "eaa356d5-c148-4ee6-9581-1040ff5a1ba1",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "1c62d382-8c52-3d57-ca17-41c1bd9454e0"
  }
]
```

### Ambiguous mappings
```json
[
  {
    "chunk_id": "1b544d21-0129-4847-9505-1453d8c9e44e",
    "source_ref": "src/lib/types/rag-source-validation.ts",
    "relative_path": "src/lib/types/rag-source-validation.ts",
    "packet_keys": [
      "ace:packet:889c0f72a70d",
      "packet:834abade8016"
    ]
  },
  {
    "chunk_id": "ec5c2513-a36c-4a9c-92db-20aba7e90c5b",
    "source_ref": "src/lib/server/gpu/background-analyzer.ts",
    "relative_path": "src/lib/server/gpu/background-analyzer.ts",
    "packet_keys": [
      "ace:packet:3e5684832d51",
      "packet:d823716773bd"
    ]
  },
  {
    "chunk_id": "2c44c80f-06e3-44d1-a851-07b9b89b807f",
    "source_ref": "src/routes/api/codebase-index/deep-research/+server.ts",
    "relative_path": "src/routes/api/codebase-index/deep-research/+server.ts",
    "packet_keys": [
      "ace:packet:8c665ed7d776",
      "packet:f16affaf2d9a"
    ]
  },
  {
    "chunk_id": "e5b40e25-e8d1-4ef9-885f-7ce968839ca5",
    "source_ref": "src/routes/(app)/command-center/codebase/graph/+page.svelte",
    "relative_path": "src/routes/(app)/command-center/codebase/graph/+page.svelte",
    "packet_keys": [
      "ace:packet:2fb40209e7b7",
      "packet:b1afbc5b4989"
    ]
  },
  {
    "chunk_id": "1ba2f03c-35ac-440c-814a-79c0cf778d93",
    "source_ref": "src/lib/components/ui/MicroInteraction.svelte",
    "relative_path": "src/lib/components/ui/MicroInteraction.svelte",
    "packet_keys": [
      "ace:packet:0050126ac87d",
      "packet:0e83fd51b7ff"
    ]
  },
  {
    "chunk_id": "105e9ef3-b2e2-46fc-a5f3-67d552034293",
    "source_ref": "src/routes/api/analytics/feedback/+server.ts",
    "relative_path": "src/routes/api/analytics/feedback/+server.ts",
    "packet_keys": [
      "ace:packet:da6c5ede6286",
      "packet:52b479bf9b4b"
    ]
  },
  {
    "chunk_id": "e8932972-10cf-48d4-ade4-78aa856d8c77",
    "source_ref": "src/lib/components/evidence/WebGPUTextureStreamingDemo.svelte",
    "relative_path": "src/lib/components/evidence/WebGPUTextureStreamingDemo.svelte",
    "packet_keys": [
      "ace:packet:3673eb4f91a8",
      "packet:5e01024e79ad"
    ]
  },
  {
    "chunk_id": "11e81bed-c98b-423a-8d44-c27654bbfe9b",
    "source_ref": "src/lib/server/fixer/fixer-memory.ts",
    "relative_path": "src/lib/server/fixer/fixer-memory.ts",
    "packet_keys": [
      "ace:packet:f64f74e8fd96",
      "packet:4b137184bae3"
    ]
  },
  {
    "chunk_id": "81d12e1c-bc10-4d37-84e1-4ae57dc808de",
    "source_ref": "src/routes/api/codebase-index/orchestrate/+server.ts",
    "relative_path": "src/routes/api/codebase-index/orchestrate/+server.ts",
    "packet_keys": [
      "ace:packet:7382499e6c8b",
      "packet:c0c072516620"
    ]
  },
  {
    "chunk_id": "ce9081d6-4879-4c7e-84ca-8fd431780c8e",
    "source_ref": "src/routes/(app)/persons-of-interest/+page.svelte",
    "relative_path": "src/routes/(app)/persons-of-interest/+page.svelte",
    "packet_keys": [
      "ace:packet:824ca689abdf",
      "packet:575d2824ddda"
    ]
  }
]
```
