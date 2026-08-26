# Packet/Chunk Mapping Audit

Generated: 2026-08-26T00:27:58.373Z
Status: WARN

## Summary

- Atlas packets: 61,660
- Codebase chunks: 52,417
- Exact source_ref matches: 87,950
- packet_key matches: 0
- feature_id matches: 0
- tree_node_id matches: 0
- qdrant_id matches: 1,280
- ambiguous mappings: 35,570
- unmapped packets: 54,319
- chunks mapped to multiple packets: 35,570
- packets mapped to multiple chunks: 6,921
- empty-path rows: 37
- invalid source refs: 37

## Samples

### Empty-path rows
```json
[
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
  },
  {
    "id": "4ad3ee46-6919-4869-a8b3-9724ecaf8983",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "27225610-6982-106e-37a5-101311179841"
  }
]
```

### Ambiguous mappings
```json
[
  {
    "chunk_id": "3e177985-ec95-461f-a2b9-1dfe262d4fc9",
    "source_ref": "src/routes/(app)/evidence/upload/+page.svelte",
    "relative_path": "src/routes/(app)/evidence/upload/+page.svelte",
    "packet_keys": [
      "ace:packet:12dd351825f2",
      "packet:255a5c0cd907"
    ]
  },
  {
    "chunk_id": "40d9083c-c8eb-4778-95f1-d1abe035425b",
    "source_ref": "src/routes/(app)/admin/codebase-index/+page.svelte",
    "relative_path": "src/routes/(app)/admin/codebase-index/+page.svelte",
    "packet_keys": [
      "ace:packet:717acaa37a87",
      "packet:d8628b36a885"
    ]
  },
  {
    "chunk_id": "5dfc2dfb-12f1-43bf-8024-c55c91a13ace",
    "source_ref": "src/lib/components/dashboard/gamification-types.ts",
    "relative_path": "src/lib/components/dashboard/gamification-types.ts",
    "packet_keys": [
      "ace:packet:1b512a2b7cae",
      "packet:66de67b1f8b3"
    ]
  },
  {
    "chunk_id": "3e23656a-bf5a-4c98-910c-277ffa053886",
    "source_ref": "src/routes/(app)/cases/[id]/board/+page.svelte",
    "relative_path": "src/routes/(app)/cases/[id]/board/+page.svelte",
    "packet_keys": [
      "ace:packet:8bc579effe53",
      "packet:3c275cde759f"
    ]
  },
  {
    "chunk_id": "17444229-26c2-4aad-8009-43f3ce5205bd",
    "source_ref": "src/lib/server/engagement/idle-reengagement.ts",
    "relative_path": "src/lib/server/engagement/idle-reengagement.ts",
    "packet_keys": [
      "ace:packet:df77f988cbb3",
      "packet:57b8e2db930d"
    ]
  },
  {
    "chunk_id": "9a004262-02ea-4165-a964-7b367946c4e7",
    "source_ref": "src/lib/server/ml/recommendation-metrics.ts",
    "relative_path": "src/lib/server/ml/recommendation-metrics.ts",
    "packet_keys": [
      "ace:packet:c51223d5373f",
      "packet:d801b2ea0052"
    ]
  },
  {
    "chunk_id": "3e39eeae-86d1-488d-a4c6-7aed859f5311",
    "source_ref": "src/lib/server/gpu/pytorch-graph.ts",
    "relative_path": "src/lib/server/gpu/pytorch-graph.ts",
    "packet_keys": [
      "ace:packet:c53ac78221aa",
      "packet:fc5108ed4814"
    ]
  },
  {
    "chunk_id": "1771d290-0427-4a67-9d00-5eb214d8ad45",
    "source_ref": "src/lib/server/db/schema/error_timeline.ts",
    "relative_path": "src/lib/server/db/schema/error_timeline.ts",
    "packet_keys": [
      "ace:packet:41516a9c7c2a",
      "packet:762983603633"
    ]
  },
  {
    "chunk_id": "1784c17f-bc94-41a8-9882-97e430190c4d",
    "source_ref": "src/lib/server/indexer/ast-chunker.ts",
    "relative_path": "src/lib/server/indexer/ast-chunker.ts",
    "packet_keys": [
      "ace:packet:0bc6e63377c6",
      "packet:40386029557b"
    ]
  },
  {
    "chunk_id": "7829086c-2496-4fea-9409-be89930db7a7",
    "source_ref": "src/types/webgpu.d.ts",
    "relative_path": "src/types/webgpu.d.ts",
    "packet_keys": [
      "ace:packet:78601ae219c9",
      "packet:17d153e1288d"
    ]
  }
]
```
