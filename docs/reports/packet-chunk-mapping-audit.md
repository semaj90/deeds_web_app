# Packet/Chunk Mapping Audit

Generated: 2026-07-14T04:54:55.904Z
Status: WARN

## Summary

- Atlas packets: 58,365
- Codebase chunks: 52,417
- Exact source_ref matches: 47,605
- packet_key matches: 0
- feature_id matches: 0
- tree_node_id matches: 0
- qdrant_id matches: 1,193
- ambiguous mappings: 429
- unmapped packets: 54,317
- chunks mapped to multiple packets: 429
- packets mapped to multiple chunks: 3,790
- empty-path rows: 37
- invalid source refs: 37

## Samples

### Empty-path rows
```json
[
  {
    "id": "7cc9ccf5-284f-4850-97f1-b507a59c819e",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "2de82a06-4b76-39f1-2ea5-93751c8622a3"
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
    "id": "c9276dae-0d44-4610-bb3a-1b0761573025",
    "source_ref": "",
    "relative_path": "",
    "qdrant_id": "3f18cd44-c6df-7d3d-e51a-0c110f3cc224"
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
    "chunk_id": "b3c3bba1-e3aa-4476-a2ed-2afe21bc5165",
    "source_ref": "docs/documents-atlas-index.md",
    "relative_path": "docs/documents-atlas-index.md",
    "packet_keys": [
      "packet:17031610ebc1",
      "packet:4bb01d486192"
    ]
  },
  {
    "chunk_id": "11284525-13c4-42b7-9e17-63d22e890e56",
    "source_ref": "src/lib/server/ace/context-assembler.ts",
    "relative_path": "src/lib/server/ace/context-assembler.ts",
    "packet_keys": [
      "packet:3b4260e18be3",
      "packet:cacfc82e8b96"
    ]
  },
  {
    "chunk_id": "12d2c6aa-887c-4877-8918-b9118cc1c504",
    "source_ref": "docs/graph/codebase-graph.json",
    "relative_path": "docs/graph/codebase-graph.json",
    "packet_keys": [
      "packet:878810a5befd",
      "packet:a6420044d24b"
    ]
  },
  {
    "chunk_id": "338aa7be-ae06-43ac-9791-e12e4a3468eb",
    "source_ref": "src/lib/server/ace/context-assembler.ts",
    "relative_path": "src/lib/server/ace/context-assembler.ts",
    "packet_keys": [
      "packet:3b4260e18be3",
      "packet:cacfc82e8b96"
    ]
  },
  {
    "chunk_id": "1515ba04-7075-44fd-9b7d-e4b5e5fc9039",
    "source_ref": "docs/documents-atlas-index.md",
    "relative_path": "docs/documents-atlas-index.md",
    "packet_keys": [
      "packet:17031610ebc1",
      "packet:4bb01d486192"
    ]
  },
  {
    "chunk_id": "179068a8-fb5c-43e4-b227-e3f3dd294a69",
    "source_ref": "docs/documents-atlas-index.md",
    "relative_path": "docs/documents-atlas-index.md",
    "packet_keys": [
      "packet:17031610ebc1",
      "packet:4bb01d486192"
    ]
  },
  {
    "chunk_id": "17988851-bb8c-42c8-a4fd-c1773b401463",
    "source_ref": "docs/operator/PHASE_18_MESSY_QUERY_ROUTING.md",
    "relative_path": "docs/operator/PHASE_18_MESSY_QUERY_ROUTING.md",
    "packet_keys": [
      "packet:34b5d222ec60",
      "packet:4502c257d42e"
    ]
  },
  {
    "chunk_id": "bb0c370e-e06e-44ba-b712-da3b05295073",
    "source_ref": "src/lib/server/ace/context-assembler.ts",
    "relative_path": "src/lib/server/ace/context-assembler.ts",
    "packet_keys": [
      "packet:3b4260e18be3",
      "packet:cacfc82e8b96"
    ]
  },
  {
    "chunk_id": "de5edc35-1339-4486-a8c0-6d81e3bd578a",
    "source_ref": "src/lib/server/ai/openai-facade.ts",
    "relative_path": "src/lib/server/ai/openai-facade.ts",
    "packet_keys": [
      "packet:3306e005a331",
      "packet:48b4b8c44e14"
    ]
  },
  {
    "chunk_id": "245d8f0b-040e-44d9-a7d2-989607c916d2",
    "source_ref": "src/lib/server/ace/context-assembler.ts",
    "relative_path": "src/lib/server/ace/context-assembler.ts",
    "packet_keys": [
      "packet:3b4260e18be3",
      "packet:cacfc82e8b96"
    ]
  }
]
```
