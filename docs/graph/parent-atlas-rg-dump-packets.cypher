// Parent Atlas rg dump packet projection

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:1"})
SET p.packetNodeId = "rg_packet:adafab68dff3201c",
    p.titleId = "rg_turbovec:chunk:0001",
    p.title = "TurboVec raw search transcript chunk 1",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 1-20000. Dominant lane: search.qdrant_vector. Snippets: Scannable — close and open the next item quickly - **Make legal-corpus page match a reference screenshot**: User provided a screenshot of a professional legal research tool (showing 3-column layout, accordion sidebar, tabs, case cards) and asked to compare, rank similarity %, and enhance. - **UnoCSS extraction problem**: Identified root cause — svelte-scoped mode can't extract complex responsive utilities, alpha channels, arbitrary values. Solution: scoped `<style>` blocks with plain CSS. Applied across 3 files (reports, dashboard, CorpusSidebar).",
    p.summaryHash = "9fffbb8d7521e24d8691734234e14afd6358a35d6c320b1aae922dbf9c96b532",
    p.dumpId = "rg_turbovec",
    p.packetRank = 1,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 1";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:1"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:be323d62698ebf8e"})
SET s.sourceRef = "318_26.txt#L34",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:1"}), (s:SourceRef {sourceRefId: "source_ref:be323d62698ebf8e"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:e90952decfe546fc"})
SET s.sourceRef = "318_26.txt#L75",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:1"}), (s:SourceRef {sourceRefId: "source_ref:e90952decfe546fc"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:648fa89c1e50de6d"})
SET s.sourceRef = "318_26.txt#L115",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:1"}), (s:SourceRef {sourceRefId: "source_ref:648fa89c1e50de6d"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:e5b70a8394c94a2f"})
SET s.sourceRef = "318_26.txt#L116",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:1"}), (s:SourceRef {sourceRefId: "source_ref:e5b70a8394c94a2f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:3cb74cc074d8b2fb"})
SET s.sourceRef = "319_26_nextsteps.txt#L16",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:1"}), (s:SourceRef {sourceRefId: "source_ref:3cb74cc074d8b2fb"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:e48cce610b173d74"})
SET s.sourceRef = "319_26_nextsteps.txt#L207",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:1"}), (s:SourceRef {sourceRefId: "source_ref:e48cce610b173d74"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:3f67c26f9946d85f"})
SET s.sourceRef = "323_26.txt#L88",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:1"}), (s:SourceRef {sourceRefId: "source_ref:3f67c26f9946d85f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:9d8f81189500b98b"})
SET s.sourceRef = "323_26.txt#L96",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:1"}), (s:SourceRef {sourceRefId: "source_ref:9d8f81189500b98b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:e88ef18b95f2ee92"})
SET s.sourceRef = "323_26.txt#L119",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:1"}), (s:SourceRef {sourceRefId: "source_ref:e88ef18b95f2ee92"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:8facefca8a9a23f5"})
SET s.sourceRef = "320ragkagdag.txt#L18",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:1"}), (s:SourceRef {sourceRefId: "source_ref:8facefca8a9a23f5"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:266a78cc2e6b2939"})
SET s.sourceRef = "330_26.txt#L92",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:1"}), (s:SourceRef {sourceRefId: "source_ref:266a78cc2e6b2939"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:47b3e56683f09f8b"})
SET s.sourceRef = "330_26.txt#L98",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:1"}), (s:SourceRef {sourceRefId: "source_ref:47b3e56683f09f8b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:2"})
SET p.packetNodeId = "rg_packet:839c041ffde2fc62",
    p.titleId = "rg_turbovec:chunk:0002",
    p.title = "TurboVec raw search transcript chunk 2",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 20001-40000. Dominant lane: search.qdrant_vector. Snippets: CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entity_nodes_embedding_hnsw ON entity_nodes USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64); // Calculate cosine similarity ): Promise<Array<{ id: string; similarity: number; metadata: Record<string, unknown> }>> {",
    p.summaryHash = "20886fa0c89c4de50d8b743483c39b8bb4f6a8f650661b00122d7e0272975069",
    p.dumpId = "rg_turbovec",
    p.packetRank = 2,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 2";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:2"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:13e989c353497512"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-15-root/node-scripts/fix_schema.cjs#L195",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:2"}), (s:SourceRef {sourceRefId: "source_ref:13e989c353497512"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:c61a34c8fc2bcc75"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-15-root/node-scripts/fix_schema.cjs#L206",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:2"}), (s:SourceRef {sourceRefId: "source_ref:c61a34c8fc2bcc75"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b4f6bb699c2ec653"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-15-root/node-scripts/fix_adapters.cjs#L411",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:2"}), (s:SourceRef {sourceRefId: "source_ref:b4f6bb699c2ec653"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:462e53112db9697b"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-15-root/node-scripts/fix_adapters.cjs#L414",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:2"}), (s:SourceRef {sourceRefId: "source_ref:462e53112db9697b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:2587861be9fe298b"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-15-root/node-scripts/fix-type-definitions.mjs#L11",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:2"}), (s:SourceRef {sourceRefId: "source_ref:2587861be9fe298b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:bd2069e7655bf157"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-15-root/node-scripts/final-fix.cjs#L29",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:2"}), (s:SourceRef {sourceRefId: "source_ref:bd2069e7655bf157"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b5ece0ae139855d8"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-15-root/node-scripts/cuda-grpc-demo.js#L110",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:2"}), (s:SourceRef {sourceRefId: "source_ref:b5ece0ae139855d8"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b9c397a4a4b4e84b"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-15-root/node-scripts/cuda-grpc-demo.js#L112",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:2"}), (s:SourceRef {sourceRefId: "source_ref:b9c397a4a4b4e84b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:5024a6430ea4d29c"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-15-root/node-scripts/cuda-grpc-demo.js#L115",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:2"}), (s:SourceRef {sourceRefId: "source_ref:5024a6430ea4d29c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:acaf9e498236e558"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-15-root/node-scripts/cuda-grpc-demo.js#L119",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:2"}), (s:SourceRef {sourceRefId: "source_ref:acaf9e498236e558"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:130fb7fcb24529e5"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-15-root/node-scripts/cuda-grpc-demo.js#L132",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:2"}), (s:SourceRef {sourceRefId: "source_ref:130fb7fcb24529e5"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:99b1e8a5b14412f0"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-15-root/node-scripts/cuda-grpc-demo.js#L140",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:2"}), (s:SourceRef {sourceRefId: "source_ref:99b1e8a5b14412f0"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:3"})
SET p.packetNodeId = "rg_packet:2a93471d154770cb",
    p.titleId = "rg_turbovec:chunk:0003",
    p.title = "TurboVec raw search transcript chunk 3",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 40001-60000. Dominant lane: search.qdrant_vector. Snippets: \"message\": \"Cannot find name 'under'. (ts)\", \"Cannot find name 'under'. (ts)\" \"message\": \"Cannot find name 'million'. (ts)\",",
    p.summaryHash = "3cd7b2668618cd2d82d51265915da69561ac3682644253794bc7b8574d1b1fc5",
    p.dumpId = "rg_turbovec",
    p.packetRank = 3,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 3";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:3"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:1a82532a249c259c"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-025.json#L2690",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:3"}), (s:SourceRef {sourceRefId: "source_ref:1a82532a249c259c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4aeda1cee5ec33d4"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-025.json#L2694",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:3"}), (s:SourceRef {sourceRefId: "source_ref:4aeda1cee5ec33d4"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:6ee5c73790ecb7b3"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-025.json#L2698",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:3"}), (s:SourceRef {sourceRefId: "source_ref:6ee5c73790ecb7b3"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:ac24d1fcbd86b17f"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-025.json#L2702",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:3"}), (s:SourceRef {sourceRefId: "source_ref:ac24d1fcbd86b17f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:6a0240618d6796e1"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-025.json#L2706",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:3"}), (s:SourceRef {sourceRefId: "source_ref:6a0240618d6796e1"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:310d869002dd179c"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-025.json#L2710",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:3"}), (s:SourceRef {sourceRefId: "source_ref:310d869002dd179c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f4850c8f0205d0c2"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-025.json#L2714",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:3"}), (s:SourceRef {sourceRefId: "source_ref:f4850c8f0205d0c2"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:ce22b7e5406604f6"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-025.json#L2718",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:3"}), (s:SourceRef {sourceRefId: "source_ref:ce22b7e5406604f6"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:05550b17c0efb577"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-025.json#L2722",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:3"}), (s:SourceRef {sourceRefId: "source_ref:05550b17c0efb577"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:35a57cafaaef3ea5"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-025.json#L2726",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:3"}), (s:SourceRef {sourceRefId: "source_ref:35a57cafaaef3ea5"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:65f6c6e5363514b6"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-025.json#L2730",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:3"}), (s:SourceRef {sourceRefId: "source_ref:65f6c6e5363514b6"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:0b791a5ae763aa6c"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-025.json#L2734",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:3"}), (s:SourceRef {sourceRefId: "source_ref:0b791a5ae763aa6c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:4"})
SET p.packetNodeId = "rg_packet:85e1c2733cd2c961",
    p.titleId = "rg_turbovec:chunk:0004",
    p.title = "TurboVec raw search transcript chunk 4",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 60001-80000. Dominant lane: search.qdrant_vector. Snippets: \"message\": \"Operator '>' cannot be applied to types 'boolean' and '{ const: any; }'.\", \"Operator '>' cannot be applied to types 'boolean' and '{ const: any; }'.\" \"message\": \"Cannot find name 'regionStats'.\",",
    p.summaryHash = "967ae99ed8269ef692bd0ebb2270b489cff8756eb4abb04fea34abead05321fb",
    p.dumpId = "rg_turbovec",
    p.packetRank = 4,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 4";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:4"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:e0e3cb8169faa4be"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-014.json#L12568",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:4"}), (s:SourceRef {sourceRefId: "source_ref:e0e3cb8169faa4be"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:472b28b9be4666ab"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-014.json#L12572",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:4"}), (s:SourceRef {sourceRefId: "source_ref:472b28b9be4666ab"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:e6226b745a00a871"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-014.json#L12576",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:4"}), (s:SourceRef {sourceRefId: "source_ref:e6226b745a00a871"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:303b5dea9c52df55"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-014.json#L12580",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:4"}), (s:SourceRef {sourceRefId: "source_ref:303b5dea9c52df55"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:0a143df05569baac"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-014.json#L12584",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:4"}), (s:SourceRef {sourceRefId: "source_ref:0a143df05569baac"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:c2d7bc8763d86cd3"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-014.json#L12588",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:4"}), (s:SourceRef {sourceRefId: "source_ref:c2d7bc8763d86cd3"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:d7edfbc7b507ac1c"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-014.json#L12624",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:4"}), (s:SourceRef {sourceRefId: "source_ref:d7edfbc7b507ac1c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:c03ef7c67fdc5cad"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-014.json#L12628",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:4"}), (s:SourceRef {sourceRefId: "source_ref:c03ef7c67fdc5cad"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:e3f61a0d3670a908"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-014.json#L12640",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:4"}), (s:SourceRef {sourceRefId: "source_ref:e3f61a0d3670a908"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:43b66e5864b45f74"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-014.json#L12644",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:4"}), (s:SourceRef {sourceRefId: "source_ref:43b66e5864b45f74"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:c0f11eff5d62a5c8"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-014.json#L12648",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:4"}), (s:SourceRef {sourceRefId: "source_ref:c0f11eff5d62a5c8"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:78d864dedb618421"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-014.json#L12652",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:4"}), (s:SourceRef {sourceRefId: "source_ref:78d864dedb618421"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:5"})
SET p.packetNodeId = "rg_packet:a5ff9b6635b86951",
    p.titleId = "rg_turbovec:chunk:0005",
    p.title = "TurboVec raw search transcript chunk 5",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 80001-100000. Dominant lane: search.qdrant_vector. Snippets: \"Cannot find name 'clearCache'.\" \"message\": \"Cannot find name 'quantization'.\", \"Cannot find name 'quantization'.\"",
    p.summaryHash = "202a0ee005cc86cf2d50be2669f5dcf628bef309c73d5753974a95b40680750a",
    p.dumpId = "rg_turbovec",
    p.packetRank = 5,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 5";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:5"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:e5c477364136166a"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-004.json#L2758",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:5"}), (s:SourceRef {sourceRefId: "source_ref:e5c477364136166a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:15d3777cab251f42"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-004.json#L2770",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:5"}), (s:SourceRef {sourceRefId: "source_ref:15d3777cab251f42"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:6ff59401bd13702c"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-004.json#L2774",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:5"}), (s:SourceRef {sourceRefId: "source_ref:6ff59401bd13702c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:7645a419972aaaf1"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-004.json#L2778",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:5"}), (s:SourceRef {sourceRefId: "source_ref:7645a419972aaaf1"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:c9e1202918a3bf7f"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-004.json#L2782",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:5"}), (s:SourceRef {sourceRefId: "source_ref:c9e1202918a3bf7f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:9caf0dfbd6d7c031"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-004.json#L2786",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:5"}), (s:SourceRef {sourceRefId: "source_ref:9caf0dfbd6d7c031"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:3facbd5231e50377"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-004.json#L2790",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:5"}), (s:SourceRef {sourceRefId: "source_ref:3facbd5231e50377"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:36f6c76025c5f365"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-004.json#L2794",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:5"}), (s:SourceRef {sourceRefId: "source_ref:36f6c76025c5f365"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:0bed93688f1087aa"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-004.json#L2798",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:5"}), (s:SourceRef {sourceRefId: "source_ref:0bed93688f1087aa"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:9debd38c28261e4c"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-004.json#L2802",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:5"}), (s:SourceRef {sourceRefId: "source_ref:9debd38c28261e4c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4248c1883cb149c2"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-004.json#L2806",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:5"}), (s:SourceRef {sourceRefId: "source_ref:4248c1883cb149c2"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:5623a4f788e91f18"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/root-stale/logs/svelte-check-post-phase19-22-chunk-004.json#L2834",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:5"}), (s:SourceRef {sourceRefId: "source_ref:5623a4f788e91f18"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:6"})
SET p.packetNodeId = "rg_packet:6fde2aeba8802ea4",
    p.titleId = "rg_turbovec:chunk:0006",
    p.title = "TurboVec raw search transcript chunk 6",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 100001-120000. Dominant lane: search.qdrant_vector. Snippets: \"Module_0_cannot_be_imported_using_this_construct_The_specifier_only_resolves_to_an_ES_module_which_c_1471\": \"'{0}' modülü bu yapı kullanılarak içe aktarılamaz. Belirtici yalnızca 'require' ile içe aktarılamayan bir ES modülüne çözümlenir. Bunun yerine bir ECMAScript içe aktarma  \"Module_0_uses_export_and_cannot_be_used_with_export_Asterisk_2498\": \"'{0}' modülü 'export =' kullanıyor ve 'export *' ile birlikte kullanılamaz.\", \"Move_the_expression_in_default_export_to_a_variable_and_add_a_type_annotation_to_it_9036\": \"Varsayılan dışarı aktarmadaki ifadeyi bir değişkene taşıyın ve bir tür ek açıklaması ekleyin.\",",
    p.summaryHash = "8111abe0e0785ac88790221760e637dacb219a5249ffda90cf1b3c85d7d5923a",
    p.dumpId = "rg_turbovec",
    p.packetRank = 6,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 6";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:6"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:be48a559d919c074"})
SET s.sourceRef = "deeds_labs/projects/legacy-projects/ingestion-phase66/node-ingestion-api/node_modules/typescript/lib/tr/diagnosticMessages.generated.json#L1040",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:6"}), (s:SourceRef {sourceRefId: "source_ref:be48a559d919c074"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:c619db5fca51a0f3"})
SET s.sourceRef = "deeds_labs/projects/legacy-projects/ingestion-phase66/node-ingestion-api/node_modules/typescript/lib/tr/diagnosticMessages.generated.json#L1051",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:6"}), (s:SourceRef {sourceRefId: "source_ref:c619db5fca51a0f3"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:2250d91d2713d15c"})
SET s.sourceRef = "deeds_labs/projects/legacy-projects/ingestion-phase66/node-ingestion-api/node_modules/typescript/lib/tr/diagnosticMessages.generated.json#L1065",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:6"}), (s:SourceRef {sourceRefId: "source_ref:2250d91d2713d15c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:389962330fd1343e"})
SET s.sourceRef = "deeds_labs/projects/legacy-projects/ingestion-phase66/node-ingestion-api/node_modules/typescript/lib/tr/diagnosticMessages.generated.json#L1079",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:6"}), (s:SourceRef {sourceRefId: "source_ref:389962330fd1343e"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:1df80ffbc8f0a379"})
SET s.sourceRef = "deeds_labs/projects/legacy-projects/ingestion-phase66/node-ingestion-api/node_modules/typescript/lib/tr/diagnosticMessages.generated.json#L1131",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:6"}), (s:SourceRef {sourceRefId: "source_ref:1df80ffbc8f0a379"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:57a35ac2469caa0a"})
SET s.sourceRef = "deeds_labs/projects/legacy-projects/ingestion-phase66/node-ingestion-api/node_modules/typescript/lib/tr/diagnosticMessages.generated.json#L1132",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:6"}), (s:SourceRef {sourceRefId: "source_ref:57a35ac2469caa0a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:7183a7ab147bc567"})
SET s.sourceRef = "deeds_labs/projects/legacy-projects/ingestion-phase66/node-ingestion-api/node_modules/typescript/lib/tr/diagnosticMessages.generated.json#L1143",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:6"}), (s:SourceRef {sourceRefId: "source_ref:7183a7ab147bc567"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:9f9ea0abdd9f2936"})
SET s.sourceRef = "deeds_labs/projects/legacy-projects/ingestion-phase66/node-ingestion-api/node_modules/typescript/lib/tr/diagnosticMessages.generated.json#L1144",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:6"}), (s:SourceRef {sourceRefId: "source_ref:9f9ea0abdd9f2936"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b9cad8f93d3fba36"})
SET s.sourceRef = "deeds_labs/projects/legacy-projects/ingestion-phase66/node-ingestion-api/node_modules/typescript/lib/tr/diagnosticMessages.generated.json#L1145",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:6"}), (s:SourceRef {sourceRefId: "source_ref:b9cad8f93d3fba36"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:50ba3a481b66d466"})
SET s.sourceRef = "deeds_labs/projects/legacy-projects/ingestion-phase66/node-ingestion-api/node_modules/typescript/lib/tr/diagnosticMessages.generated.json#L1146",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:6"}), (s:SourceRef {sourceRefId: "source_ref:50ba3a481b66d466"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:3e0823690744cdea"})
SET s.sourceRef = "deeds_labs/projects/legacy-projects/ingestion-phase66/node-ingestion-api/node_modules/typescript/lib/tr/diagnosticMessages.generated.json#L1149",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:6"}), (s:SourceRef {sourceRefId: "source_ref:3e0823690744cdea"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:44e7b1dade77247d"})
SET s.sourceRef = "deeds_labs/projects/legacy-projects/ingestion-phase66/node-ingestion-api/node_modules/typescript/lib/tr/diagnosticMessages.generated.json#L1156",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:6"}), (s:SourceRef {sourceRefId: "source_ref:44e7b1dade77247d"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:7"})
SET p.packetNodeId = "rg_packet:9b6736a903133d2d",
    p.titleId = "rg_turbovec:chunk:0007",
    p.title = "TurboVec raw search transcript chunk 7",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 120001-140000. Dominant lane: search.qdrant_vector. Snippets: - Cosine similarity search - Minimum similarity thresholds - AVX2 SIMD structural character scanning",
    p.summaryHash = "3b844df03d0424ab2c440102f302ceea07636379d4d54f8375336f8ebea664ce",
    p.dumpId = "rg_turbovec",
    p.packetRank = 7,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 7";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:7"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:1be3e7974f6950d9"})
SET s.sourceRef = "deeds_labs/frontend/sveltekit-frontend-archive/dirs/documents/implementation/COMPLETE-IMPLEMENTATION-SUMMARY.md#L18",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:7"}), (s:SourceRef {sourceRefId: "source_ref:1be3e7974f6950d9"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:e8f8a63907c8708b"})
SET s.sourceRef = "deeds_labs/frontend/sveltekit-frontend-archive/dirs/documents/implementation/COMPLETE-IMPLEMENTATION-SUMMARY.md#L30",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:7"}), (s:SourceRef {sourceRefId: "source_ref:e8f8a63907c8708b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:47138fdac9d7bd86"})
SET s.sourceRef = "deeds_labs/frontend/sveltekit-frontend-archive/dirs/documents/implementation/COMPLETE-IMPLEMENTATION-SUMMARY.md#L36",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:7"}), (s:SourceRef {sourceRefId: "source_ref:47138fdac9d7bd86"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:682d241748550430"})
SET s.sourceRef = "deeds_labs/frontend/sveltekit-frontend-archive/dirs/documents/implementation/COMPLETE-IMPLEMENTATION-SUMMARY.md#L125",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:7"}), (s:SourceRef {sourceRefId: "source_ref:682d241748550430"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:52d1ef9e21ecd103"})
SET s.sourceRef = "deeds_labs/frontend/sveltekit-frontend-archive/dirs/documents/implementation/COMPLETE-IMPLEMENTATION-SUMMARY.md#L197",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:7"}), (s:SourceRef {sourceRefId: "source_ref:52d1ef9e21ecd103"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b0f9e1be77dbc83e"})
SET s.sourceRef = "deeds_labs/frontend/sveltekit-frontend-archive/dirs/documents/implementation/COMPLETE-IMPLEMENTATION-SUMMARY.md#L209",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:7"}), (s:SourceRef {sourceRefId: "source_ref:b0f9e1be77dbc83e"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:72dfb1c873c9cc4b"})
SET s.sourceRef = "deeds_labs/frontend/sveltekit-frontend-archive/dirs/documents/implementation/COMPLETE-IMPLEMENTATION-REPORT.md#L62",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:7"}), (s:SourceRef {sourceRefId: "source_ref:72dfb1c873c9cc4b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:7490df6d666c5bcf"})
SET s.sourceRef = "node_modules/date-fns/CHANGELOG.md#L501",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:7"}), (s:SourceRef {sourceRefId: "source_ref:7490df6d666c5bcf"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f82270f12d3a504b"})
SET s.sourceRef = "node_modules/date-fns/CHANGELOG.md#L1652",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:7"}), (s:SourceRef {sourceRefId: "source_ref:f82270f12d3a504b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:1a3e9d702c879389"})
SET s.sourceRef = "node_modules/date-fns/CHANGELOG.md#L1696",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:7"}), (s:SourceRef {sourceRefId: "source_ref:1a3e9d702c879389"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:10dd19dbe7374312"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/bucket-c-stale/_archived/native-simdjson/src/native/simdjson-addon/simdjson/benchmark/kostya/nlohmann_json_sax.h#L9",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:7"}), (s:SourceRef {sourceRefId: "source_ref:10dd19dbe7374312"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f1cb30cbc0600db1"})
SET s.sourceRef = "deeds_labs/snapshots/2026-03-10/bucket-c-stale/_archived/native-simdjson/src/native/simdjson-addon/simdjson/benchmark/kostya/nlohmann_json_sax.h#L11",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:7"}), (s:SourceRef {sourceRefId: "source_ref:f1cb30cbc0600db1"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:8"})
SET p.packetNodeId = "rg_packet:8601b2dd98cb5950",
    p.titleId = "rg_turbovec:chunk:0008",
    p.title = "TurboVec raw search transcript chunk 8",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 140001-160000. Dominant lane: search.qdrant_vector. Snippets: \u001b[31mError\u001b[39m: Cannot find name 'UserWorkflowContext'. \u001b[31mError\u001b[39m: Cannot find name 'end'. \u001b[31mError\u001b[39m: Cannot find name 'url'.",
    p.summaryHash = "85cf01c89cb784ad92eb9f57ad4435e5c61d4ca7e05adbd5069f43254d71de3c",
    p.dumpId = "rg_turbovec",
    p.packetRank = 8,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 8";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:8"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:47604d4b691fbb41"})
SET s.sourceRef = "sveltekit-frontend/temp-errors-raw.txt#L202071",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:8"}), (s:SourceRef {sourceRefId: "source_ref:47604d4b691fbb41"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:5c7ef70a776645fd"})
SET s.sourceRef = "sveltekit-frontend/temp-errors-raw.txt#L202103",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:8"}), (s:SourceRef {sourceRefId: "source_ref:5c7ef70a776645fd"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:ddf044acef13cbab"})
SET s.sourceRef = "sveltekit-frontend/temp-errors-raw.txt#L202307",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:8"}), (s:SourceRef {sourceRefId: "source_ref:ddf044acef13cbab"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:35de9ff336d96f4b"})
SET s.sourceRef = "sveltekit-frontend/temp-errors-raw.txt#L202319",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:8"}), (s:SourceRef {sourceRefId: "source_ref:35de9ff336d96f4b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:53911c68adf79c9a"})
SET s.sourceRef = "sveltekit-frontend/temp-errors-raw.txt#L202325",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:8"}), (s:SourceRef {sourceRefId: "source_ref:53911c68adf79c9a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:69f98d7f9f08f322"})
SET s.sourceRef = "sveltekit-frontend/temp-errors-raw.txt#L202330",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:8"}), (s:SourceRef {sourceRefId: "source_ref:69f98d7f9f08f322"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:760058c2834e6892"})
SET s.sourceRef = "sveltekit-frontend/temp-errors-raw.txt#L202335",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:8"}), (s:SourceRef {sourceRefId: "source_ref:760058c2834e6892"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:6c761febb767bdcb"})
SET s.sourceRef = "sveltekit-frontend/temp-errors-raw.txt#L202350",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:8"}), (s:SourceRef {sourceRefId: "source_ref:6c761febb767bdcb"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:d5138c41993e02b3"})
SET s.sourceRef = "sveltekit-frontend/temp-errors-raw.txt#L202415",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:8"}), (s:SourceRef {sourceRefId: "source_ref:d5138c41993e02b3"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:68b0b819085a1dc4"})
SET s.sourceRef = "sveltekit-frontend/temp-errors-raw.txt#L202433",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:8"}), (s:SourceRef {sourceRefId: "source_ref:68b0b819085a1dc4"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:32b6f6d109b7b4b3"})
SET s.sourceRef = "sveltekit-frontend/temp-errors-raw.txt#L202445",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:8"}), (s:SourceRef {sourceRefId: "source_ref:32b6f6d109b7b4b3"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4467215aec544611"})
SET s.sourceRef = "sveltekit-frontend/temp-errors-raw.txt#L202451",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:8"}), (s:SourceRef {sourceRefId: "source_ref:4467215aec544611"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:9"})
SET p.packetNodeId = "rg_packet:057610d61759322b",
    p.titleId = "rg_turbovec:chunk:0009",
    p.title = "TurboVec raw search transcript chunk 9",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 160001-180000. Dominant lane: search.qdrant_vector. Snippets: \u001b[31mError\u001b[39m: Cannot redeclare block-scoped variable 'timer'. \u001b[31mError\u001b[39m: Cannot find name 'timeoutMs'. \u001b[31mError\u001b[39m: Cannot find name 'output'.",
    p.summaryHash = "11c2bd9013b67360abcb2c5f18ddd61286fb3386d9d6c0d40bca202ce67a1f85",
    p.dumpId = "rg_turbovec",
    p.packetRank = 9,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 9";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:9"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:29abbc7507c352d5"})
SET s.sourceRef = "sveltekit-frontend/svelte_check_full.txt#L268915",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:9"}), (s:SourceRef {sourceRefId: "source_ref:29abbc7507c352d5"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:470b80bbf4083132"})
SET s.sourceRef = "sveltekit-frontend/svelte_check_full.txt#L268920",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:9"}), (s:SourceRef {sourceRefId: "source_ref:470b80bbf4083132"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:2eb765473d1cc85f"})
SET s.sourceRef = "sveltekit-frontend/svelte_check_full.txt#L268931",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:9"}), (s:SourceRef {sourceRefId: "source_ref:2eb765473d1cc85f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:6c3090be49fd12cf"})
SET s.sourceRef = "sveltekit-frontend/svelte_check_full.txt#L268937",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:9"}), (s:SourceRef {sourceRefId: "source_ref:6c3090be49fd12cf"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:c5482b2715a54bc4"})
SET s.sourceRef = "sveltekit-frontend/svelte_check_full.txt#L268943",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:9"}), (s:SourceRef {sourceRefId: "source_ref:c5482b2715a54bc4"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:32a5e7321bc5d48e"})
SET s.sourceRef = "sveltekit-frontend/svelte_check_full.txt#L268949",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:9"}), (s:SourceRef {sourceRefId: "source_ref:32a5e7321bc5d48e"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:65b1ab229815fb42"})
SET s.sourceRef = "sveltekit-frontend/svelte_check_full.txt#L268955",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:9"}), (s:SourceRef {sourceRefId: "source_ref:65b1ab229815fb42"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:d3dba0bc0a246fa9"})
SET s.sourceRef = "sveltekit-frontend/svelte_check_full.txt#L268967",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:9"}), (s:SourceRef {sourceRefId: "source_ref:d3dba0bc0a246fa9"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:47244c4fcf55d008"})
SET s.sourceRef = "sveltekit-frontend/svelte_check_full.txt#L268997",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:9"}), (s:SourceRef {sourceRefId: "source_ref:47244c4fcf55d008"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:60ecc144b310eb49"})
SET s.sourceRef = "sveltekit-frontend/svelte_check_full.txt#L269015",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:9"}), (s:SourceRef {sourceRefId: "source_ref:60ecc144b310eb49"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:cf2bf351ca53a8d2"})
SET s.sourceRef = "sveltekit-frontend/svelte_check_full.txt#L269027",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:9"}), (s:SourceRef {sourceRefId: "source_ref:cf2bf351ca53a8d2"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:dbd47d724becbaeb"})
SET s.sourceRef = "sveltekit-frontend/svelte_check_full.txt#L269050",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:9"}), (s:SourceRef {sourceRefId: "source_ref:dbd47d724becbaeb"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:10"})
SET p.packetNodeId = "rg_packet:12ffc60fb7e5c0f9",
    p.titleId = "rg_turbovec:chunk:0010",
    p.title = "TurboVec raw search transcript chunk 10",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 180001-200000. Dominant lane: search.qdrant_vector. Snippets: 1766776701665 ERROR \"src\\\\lib\\\\utils\\\\simd-json-cache.ts\" 5:516 \"Cannot find name 'REDIS_URL'.\" 1766776701665 ERROR \"src\\\\lib\\\\utils\\\\simd-json-cache.ts\" 5:553 \"Cannot find name 'defaultTTL'.\" 1766776701665 ERROR \"src\\\\lib\\\\utils\\\\simd-json-cache.ts\" 5:565 \"Cannot find name 'config'.\"",
    p.summaryHash = "63478b85e2de18bd8001be1e45488297a7bf347839156aea1d9b1c59a17c5854",
    p.dumpId = "rg_turbovec",
    p.packetRank = 10,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 10";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:10"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:27256b7a04d45c98"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-machine.txt#L7394",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:10"}), (s:SourceRef {sourceRefId: "source_ref:27256b7a04d45c98"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:8e5857d769422fb4"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-machine.txt#L7395",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:10"}), (s:SourceRef {sourceRefId: "source_ref:8e5857d769422fb4"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4c40b77243d796b1"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-machine.txt#L7396",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:10"}), (s:SourceRef {sourceRefId: "source_ref:4c40b77243d796b1"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:fca2759c9daf1608"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-machine.txt#L7398",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:10"}), (s:SourceRef {sourceRefId: "source_ref:fca2759c9daf1608"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b4209dab2f6c3acf"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-machine.txt#L7399",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:10"}), (s:SourceRef {sourceRefId: "source_ref:b4209dab2f6c3acf"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:a018a20ce120bf42"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-machine.txt#L7401",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:10"}), (s:SourceRef {sourceRefId: "source_ref:a018a20ce120bf42"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:ec3e8266670b7982"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-machine.txt#L7402",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:10"}), (s:SourceRef {sourceRefId: "source_ref:ec3e8266670b7982"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:90846d1970f01a25"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-machine.txt#L7404",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:10"}), (s:SourceRef {sourceRefId: "source_ref:90846d1970f01a25"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f6960b3dfe3ccd5f"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-machine.txt#L7405",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:10"}), (s:SourceRef {sourceRefId: "source_ref:f6960b3dfe3ccd5f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:c129a0d75459068f"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-machine.txt#L7406",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:10"}), (s:SourceRef {sourceRefId: "source_ref:c129a0d75459068f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:7a1bb662fce66208"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-machine.txt#L7408",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:10"}), (s:SourceRef {sourceRefId: "source_ref:7a1bb662fce66208"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:9f023c85c3c74358"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-machine.txt#L7409",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:10"}), (s:SourceRef {sourceRefId: "source_ref:9f023c85c3c74358"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:11"})
SET p.packetNodeId = "rg_packet:8cdc6faa689e6065",
    p.titleId = "rg_turbovec:chunk:0011",
    p.title = "TurboVec raw search transcript chunk 11",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 200001-220000. Dominant lane: search.qdrant_vector. Snippets: 1769209844320 ERROR \"src\\\\lib\\\\components\\\\auth\\\\PermissionGuard.svelte\" 27:18 \"Cannot find name 'authStore'.\" 1769209844320 ERROR \"src\\\\lib\\\\components\\\\auth\\\\PermissionGuard.svelte\" 31:45 \"Cannot find name 'authStore'.\" 1769209844320 ERROR \"src\\\\lib\\\\components\\\\auth\\\\PermissionGuard.svelte\" 32:46 \"Cannot find name 'authStore'.\"",
    p.summaryHash = "1b539a9f46d1e02f531f2bb7d5c0540417f320935de1132738572f30b10878b0",
    p.dumpId = "rg_turbovec",
    p.packetRank = 11,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 11";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:11"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:04dfd1430790186f"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-9.txt#L2294",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:11"}), (s:SourceRef {sourceRefId: "source_ref:04dfd1430790186f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:a5e1649477ef8f6e"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-9.txt#L2296",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:11"}), (s:SourceRef {sourceRefId: "source_ref:a5e1649477ef8f6e"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:7d44778cbf8c7a42"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-9.txt#L2297",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:11"}), (s:SourceRef {sourceRefId: "source_ref:7d44778cbf8c7a42"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:40b6e13d162782d0"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-9.txt#L2298",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:11"}), (s:SourceRef {sourceRefId: "source_ref:40b6e13d162782d0"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:e4498fd770302da2"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-9.txt#L2299",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:11"}), (s:SourceRef {sourceRefId: "source_ref:e4498fd770302da2"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b56fd40fd7b29a4c"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-9.txt#L2300",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:11"}), (s:SourceRef {sourceRefId: "source_ref:b56fd40fd7b29a4c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:8ddfc73c961185c8"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-9.txt#L2301",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:11"}), (s:SourceRef {sourceRefId: "source_ref:8ddfc73c961185c8"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:1c87d8239eb3fc1f"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-9.txt#L2303",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:11"}), (s:SourceRef {sourceRefId: "source_ref:1c87d8239eb3fc1f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:0cd39f8c235527d6"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-9.txt#L2305",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:11"}), (s:SourceRef {sourceRefId: "source_ref:0cd39f8c235527d6"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:59082e3039448eb3"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-9.txt#L2322",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:11"}), (s:SourceRef {sourceRefId: "source_ref:59082e3039448eb3"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:6ea52578f411195b"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-9.txt#L2323",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:11"}), (s:SourceRef {sourceRefId: "source_ref:6ea52578f411195b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:baf9bf8d06652d3a"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-9.txt#L2324",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:11"}), (s:SourceRef {sourceRefId: "source_ref:baf9bf8d06652d3a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:12"})
SET p.packetNodeId = "rg_packet:ab09f670a1783232",
    p.titleId = "rg_turbovec:chunk:0012",
    p.title = "TurboVec raw search transcript chunk 12",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 220001-240000. Dominant lane: search.qdrant_vector. Snippets: \u001b[31mError\u001b[39m: Cannot find name 'globalServices'. \u001b[31mError\u001b[39m: 'url' cannot be used as a value because it was imported using 'import type'. \u001b[31mError\u001b[39m: Cannot find name 'globalServices'.",
    p.summaryHash = "0b7adeba4b71a6ce1ecb81c2d07895bb849b6fc95ff74126199d20ac9878cf1d",
    p.dumpId = "rg_turbovec",
    p.packetRank = 12,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 12";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:12"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:1da79672a093e763"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-4.txt#L43056",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:12"}), (s:SourceRef {sourceRefId: "source_ref:1da79672a093e763"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:deb333ba798806cc"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-4.txt#L43062",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:12"}), (s:SourceRef {sourceRefId: "source_ref:deb333ba798806cc"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:25b0fffae0a87191"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-4.txt#L43068",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:12"}), (s:SourceRef {sourceRefId: "source_ref:25b0fffae0a87191"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:0f9dde28f1a6b63b"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-4.txt#L43074",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:12"}), (s:SourceRef {sourceRefId: "source_ref:0f9dde28f1a6b63b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b7c2b0f36dde207f"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-4.txt#L43079",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:12"}), (s:SourceRef {sourceRefId: "source_ref:b7c2b0f36dde207f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:19c346c347d69a2b"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-4.txt#L43084",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:12"}), (s:SourceRef {sourceRefId: "source_ref:19c346c347d69a2b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f701d1d33a0a8c68"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-4.txt#L43152",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:12"}), (s:SourceRef {sourceRefId: "source_ref:f701d1d33a0a8c68"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:506176dc57df685b"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-4.txt#L43176",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:12"}), (s:SourceRef {sourceRefId: "source_ref:506176dc57df685b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b2acfadee8128cb5"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-4.txt#L43182",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:12"}), (s:SourceRef {sourceRefId: "source_ref:b2acfadee8128cb5"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4fa18825388d4db2"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-4.txt#L43188",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:12"}), (s:SourceRef {sourceRefId: "source_ref:4fa18825388d4db2"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:0ef20cde0cb01430"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-4.txt#L43212",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:12"}), (s:SourceRef {sourceRefId: "source_ref:0ef20cde0cb01430"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:138572c5cf6e56ce"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-4.txt#L43349",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:12"}), (s:SourceRef {sourceRefId: "source_ref:138572c5cf6e56ce"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:13"})
SET p.packetNodeId = "rg_packet:8d3aa3cce547ed8b",
    p.titleId = "rg_turbovec:chunk:0013",
    p.title = "TurboVec raw search transcript chunk 13",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 240001-260000. Dominant lane: search.qdrant_vector. Snippets: \u001b[36mexport interface WorkerResult { taskId: string, success: boolean: data?: null; // Changed from 'any' to, 'null' error?: string,processingTime: number, workerId: string}export interface WorkerPoolConfig { maxWorkers: number, workerTimeout: number, queueLimit: number, enableSI \u001b[36mexport interface WorkerResult { taskId: string, success: boolean: data?: null; // Changed from 'any' to, 'null' error?: string,processingTime: number, workerId: string}export interface WorkerPoolConfig { maxWorkers: number, workerTimeout: number, queueLimit: number, enableSI \u001b[31mError\u001b[39m: Cannot find name 'concurrencyLimit'.",
    p.summaryHash = "3da51636f31ad31fd1b3bc88f9a9f0411609486164521faf719bc2327fd5dd62",
    p.dumpId = "rg_turbovec",
    p.packetRank = 13,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 13";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:13"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:9eec057bd404d4ed"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L5643",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:13"}), (s:SourceRef {sourceRefId: "source_ref:9eec057bd404d4ed"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b5fdb3edbfb31d2f"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L5649",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:13"}), (s:SourceRef {sourceRefId: "source_ref:b5fdb3edbfb31d2f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:be77b87aa34137fa"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L5654",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:13"}), (s:SourceRef {sourceRefId: "source_ref:be77b87aa34137fa"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:49b4d8633326b0fe"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L5655",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:13"}), (s:SourceRef {sourceRefId: "source_ref:49b4d8633326b0fe"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:2e34a7f57eac4e71"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L5660",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:13"}), (s:SourceRef {sourceRefId: "source_ref:2e34a7f57eac4e71"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:022422883c6a34de"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L5661",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:13"}), (s:SourceRef {sourceRefId: "source_ref:022422883c6a34de"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4f9b2d66aa793dd1"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L5666",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:13"}), (s:SourceRef {sourceRefId: "source_ref:4f9b2d66aa793dd1"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:d4712a14d9237bc0"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L5667",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:13"}), (s:SourceRef {sourceRefId: "source_ref:d4712a14d9237bc0"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:cffb49e58e1b3efc"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L5672",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:13"}), (s:SourceRef {sourceRefId: "source_ref:cffb49e58e1b3efc"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b098333ee0675215"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L5673",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:13"}), (s:SourceRef {sourceRefId: "source_ref:b098333ee0675215"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:a80a1616bbd6b694"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L5678",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:13"}), (s:SourceRef {sourceRefId: "source_ref:a80a1616bbd6b694"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:98fa8a44fb927007"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L5679",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:13"}), (s:SourceRef {sourceRefId: "source_ref:98fa8a44fb927007"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:14"})
SET p.packetNodeId = "rg_packet:42184c1a378b9f09",
    p.titleId = "rg_turbovec:chunk:0014",
    p.title = "TurboVec raw search transcript chunk 14",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 260001-280000. Dominant lane: search.qdrant_vector. Snippets: ,savedAt: new Date(), metadata: { ocrExtracted: true | ocrConfidence, ocrResult.confidence: ocrBoundingBoxes | ocrResult.boundingBoxes: sourceDocument | ocrResult.sourceDocument: processingJobId | ocrResult.jobId: processingStatus: 'completed' } } await this.saveNote(note); retur \u001b[35m,\u001b[36msavedAt: new Date(), metadata: { ocrExtracted: true | ocrConfidence, ocrResult.confidence: ocrBoundingBoxes | ocrResult.boundingBoxes: sourceDocument | ocrResult.sourceDocument: processingJobId | ocrResult.jobId: processingStatus: 'completed' } } await this.saveNote(no ,savedAt: new Date(), metadata\u001b[35m:\u001b[36m { ocrExtracted: true | ocrConfidence, ocrResult.confidence: ocrBoundingBoxes | ocrResult.boundingBoxes: sourceDocument | ocrResult.sourceDocument: processingJobId | ocrResult.jobId: processingStatus: 'completed' } } await this.saveNote(no",
    p.summaryHash = "517c47fde61c4969896a99ef11db4bd7d8ad45554d95728e52899978d16f3148",
    p.dumpId = "rg_turbovec",
    p.packetRank = 14,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 14";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:14"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:72806055280975ba"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L241814",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:14"}), (s:SourceRef {sourceRefId: "source_ref:72806055280975ba"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:1f0134ed29bd79f6"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L241819",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:14"}), (s:SourceRef {sourceRefId: "source_ref:1f0134ed29bd79f6"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:685fdc20bb8e475a"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L241825",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:14"}), (s:SourceRef {sourceRefId: "source_ref:685fdc20bb8e475a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:d6f7cc4f61c37857"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L241831",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:14"}), (s:SourceRef {sourceRefId: "source_ref:d6f7cc4f61c37857"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b675f4065b44632c"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L241837",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:14"}), (s:SourceRef {sourceRefId: "source_ref:b675f4065b44632c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:c01ebc8b4a2a9429"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L241843",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:14"}), (s:SourceRef {sourceRefId: "source_ref:c01ebc8b4a2a9429"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:38d51e383b3644f1"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L241849",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:14"}), (s:SourceRef {sourceRefId: "source_ref:38d51e383b3644f1"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:1b6f8ae18160fffd"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L241855",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:14"}), (s:SourceRef {sourceRefId: "source_ref:1b6f8ae18160fffd"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:0ba5763b0dab1f5a"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L241861",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:14"}), (s:SourceRef {sourceRefId: "source_ref:0ba5763b0dab1f5a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:213701f5d0a8cc11"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L241913",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:14"}), (s:SourceRef {sourceRefId: "source_ref:213701f5d0a8cc11"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:93c0adbc956fa43e"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L241919",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:14"}), (s:SourceRef {sourceRefId: "source_ref:93c0adbc956fa43e"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:c78453ab1842eb40"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-routes-20251221-1325.txt#L241925",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:14"}), (s:SourceRef {sourceRefId: "source_ref:c78453ab1842eb40"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:15"})
SET p.packetNodeId = "rg_packet:0ec04dec00357204",
    p.titleId = "rg_turbovec:chunk:0015",
    p.title = "TurboVec raw search transcript chunk 15",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 280001-300000. Dominant lane: search.qdrant_vector. Snippets: 1767571044275 ERROR \"src\\\\lib\\\\server\\\\services\\\\qdrant-client.ts\" 15:1427 \"Cannot find name 'body'.\" 1767571044275 ERROR \"src\\\\lib\\\\server\\\\services\\\\qdrant-client.ts\" 15:1562 \"Cannot find name 'collectionName'.\" 1767571044275 ERROR \"src\\\\lib\\\\server\\\\services\\\\qdrant-client.ts\" 15:1578 \"Cannot find name 'body'.\"",
    p.summaryHash = "42041f44d5602c22d235e28279a71c9a085e3ea3d51552c1f8b0e3b4b6b5c1e8",
    p.dumpId = "rg_turbovec",
    p.packetRank = 15,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 15";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:15"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:0238106448203db3"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results.txt#L72456",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:15"}), (s:SourceRef {sourceRefId: "source_ref:0238106448203db3"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:3b75c2d4a099ee05"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results.txt#L72458",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:15"}), (s:SourceRef {sourceRefId: "source_ref:3b75c2d4a099ee05"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:27a4d514c23dcb5b"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results.txt#L72459",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:15"}), (s:SourceRef {sourceRefId: "source_ref:27a4d514c23dcb5b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:9088fe0c792f13ff"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results.txt#L72460",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:15"}), (s:SourceRef {sourceRefId: "source_ref:9088fe0c792f13ff"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:5c3a9cae676dc6b7"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results.txt#L72461",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:15"}), (s:SourceRef {sourceRefId: "source_ref:5c3a9cae676dc6b7"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:1476f8878a45d9a5"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results.txt#L72462",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:15"}), (s:SourceRef {sourceRefId: "source_ref:1476f8878a45d9a5"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:2d535890fd7ddfee"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results.txt#L72464",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:15"}), (s:SourceRef {sourceRefId: "source_ref:2d535890fd7ddfee"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:68499216eb2080c1"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results.txt#L72467",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:15"}), (s:SourceRef {sourceRefId: "source_ref:68499216eb2080c1"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:a0f86c8d1766dff5"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results.txt#L72468",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:15"}), (s:SourceRef {sourceRefId: "source_ref:a0f86c8d1766dff5"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:a731e5653e64810b"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results.txt#L72469",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:15"}), (s:SourceRef {sourceRefId: "source_ref:a731e5653e64810b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:44f94fa2c04a5904"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results.txt#L72471",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:15"}), (s:SourceRef {sourceRefId: "source_ref:44f94fa2c04a5904"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:bdea573b68744360"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results.txt#L72472",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:15"}), (s:SourceRef {sourceRefId: "source_ref:bdea573b68744360"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:16"})
SET p.packetNodeId = "rg_packet:41d01e6081e6bc15",
    p.titleId = "rg_turbovec:chunk:0016",
    p.title = "TurboVec raw search transcript chunk 16",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 300001-320000. Dominant lane: search.qdrant_vector. Snippets: 1767733160200 ERROR \"src\\\\lib\\\\optimization\\\\index.ts\" 29:52 \"Cannot find name 'GoServiceOptimizationConfig'.\" 1767733160200 ERROR \"src\\\\lib\\\\optimization\\\\index.ts\" 30:47 \"Cannot find name 'OllamaClusterConfig'.\" 1767733160200 ERROR \"src\\\\lib\\\\optimization\\\\index.ts\" 31:46 \"Cannot find name 'DatabaseOptimizationConfig'.\"",
    p.summaryHash = "2d0f5a7942501f5d3b44b5fc1c49b689db74660b2990b4da809f752e75a7c296",
    p.dumpId = "rg_turbovec",
    p.packetRank = 16,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 16";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:16"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:e8b766892e67dfef"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase3.txt#L29768",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:16"}), (s:SourceRef {sourceRefId: "source_ref:e8b766892e67dfef"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:3f4a1da81feabdc3"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase3.txt#L29769",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:16"}), (s:SourceRef {sourceRefId: "source_ref:3f4a1da81feabdc3"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:647223796659430a"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase3.txt#L29770",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:16"}), (s:SourceRef {sourceRefId: "source_ref:647223796659430a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:cb280a6e4e4950b9"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase3.txt#L29771",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:16"}), (s:SourceRef {sourceRefId: "source_ref:cb280a6e4e4950b9"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:c8432195e089d93b"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase3.txt#L29774",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:16"}), (s:SourceRef {sourceRefId: "source_ref:c8432195e089d93b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f5bca49a3df6f58c"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase3.txt#L29775",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:16"}), (s:SourceRef {sourceRefId: "source_ref:f5bca49a3df6f58c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:c001377de13ccf0d"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase3.txt#L29776",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:16"}), (s:SourceRef {sourceRefId: "source_ref:c001377de13ccf0d"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:5d0682de0a4fa50d"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase3.txt#L29777",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:16"}), (s:SourceRef {sourceRefId: "source_ref:5d0682de0a4fa50d"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:9b46293e0b2f9889"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase3.txt#L29778",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:16"}), (s:SourceRef {sourceRefId: "source_ref:9b46293e0b2f9889"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:11dfbd32aa21f8c0"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase3.txt#L29779",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:16"}), (s:SourceRef {sourceRefId: "source_ref:11dfbd32aa21f8c0"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4046f99a96b4f58e"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase3.txt#L29860",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:16"}), (s:SourceRef {sourceRefId: "source_ref:4046f99a96b4f58e"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4f6caf05008ed568"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase3.txt#L29861",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:16"}), (s:SourceRef {sourceRefId: "source_ref:4f6caf05008ed568"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:17"})
SET p.packetNodeId = "rg_packet:01556ac73b50ab52",
    p.titleId = "rg_turbovec:chunk:0017",
    p.title = "TurboVec raw search transcript chunk 17",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 320001-340000. Dominant lane: search.qdrant_vector. Snippets: 1767731237284 ERROR \"src\\\\lib\\\\services\\\\ocrService.ts\" 16:124 \"'file' cannot be used as a value because it was imported using 'import type'.\" 1767731237284 ERROR \"src\\\\lib\\\\services\\\\ocrService.ts\" 16:140 \"Cannot find name 'extractBoundingBoxes'.\" 1767731237284 ERROR \"src\\\\lib\\\\services\\\\ocrService.ts\" 16:168 \"Cannot find name 'BoundingBox'.\"",
    p.summaryHash = "1656e73110e35660d193cc7d6d9e55dbc0ef197ba9f340d2ff62254b49403060",
    p.dumpId = "rg_turbovec",
    p.packetRank = 17,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 17";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:17"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:befa09b5501a5960"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2.txt#L14455",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:17"}), (s:SourceRef {sourceRefId: "source_ref:befa09b5501a5960"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:1889af3c0c82db0d"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2.txt#L14457",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:17"}), (s:SourceRef {sourceRefId: "source_ref:1889af3c0c82db0d"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:020961fb2aebb2e8"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2.txt#L14458",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:17"}), (s:SourceRef {sourceRefId: "source_ref:020961fb2aebb2e8"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4243b9ddadad4379"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2.txt#L14459",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:17"}), (s:SourceRef {sourceRefId: "source_ref:4243b9ddadad4379"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:57b82a99b45aab75"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2.txt#L14460",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:17"}), (s:SourceRef {sourceRefId: "source_ref:57b82a99b45aab75"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b179ea3e1c32281e"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2.txt#L14461",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:17"}), (s:SourceRef {sourceRefId: "source_ref:b179ea3e1c32281e"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:8ed386980165aae0"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2.txt#L14463",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:17"}), (s:SourceRef {sourceRefId: "source_ref:8ed386980165aae0"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:abb11be3a1f3079a"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2.txt#L14465",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:17"}), (s:SourceRef {sourceRefId: "source_ref:abb11be3a1f3079a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:47a31d6e03465fb7"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2.txt#L14466",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:17"}), (s:SourceRef {sourceRefId: "source_ref:47a31d6e03465fb7"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:38274260ef4ea460"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2.txt#L14467",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:17"}), (s:SourceRef {sourceRefId: "source_ref:38274260ef4ea460"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:6cd4cb3e3cabc24a"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2.txt#L14468",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:17"}), (s:SourceRef {sourceRefId: "source_ref:6cd4cb3e3cabc24a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:ce127bff4df4e891"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2.txt#L14472",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:17"}), (s:SourceRef {sourceRefId: "source_ref:ce127bff4df4e891"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:18"})
SET p.packetNodeId = "rg_packet:c298f35616466fdd",
    p.titleId = "rg_turbovec:chunk:0018",
    p.title = "TurboVec raw search transcript chunk 18",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 340001-360000. Dominant lane: search.qdrant_vector. Snippets: 1767731879815 ERROR \"src\\\\lib\\\\gemma3Client.ts\" 158:9 \"The value 'undefined' cannot be used here.\" 1767731879815 ERROR \"src\\\\lib\\\\polyfills.ts\" 38:64 \"Cannot find name 'version'.\" 1767731879815 ERROR \"src\\\\lib\\\\polyfills.ts\" 39:4 \"Cannot find name 'versions'.\"",
    p.summaryHash = "0e85edc376805173b5a2e83b9dc348c237a852f9a345dea74514e9714c99d538",
    p.dumpId = "rg_turbovec",
    p.packetRank = 18,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 18";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:18"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:42e10009aa125cb4"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L132",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:18"}), (s:SourceRef {sourceRefId: "source_ref:42e10009aa125cb4"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:a206390cd76f318c"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L141",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:18"}), (s:SourceRef {sourceRefId: "source_ref:a206390cd76f318c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:5f1d5d5b6a532089"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L142",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:18"}), (s:SourceRef {sourceRefId: "source_ref:5f1d5d5b6a532089"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:c0b7419220887ed2"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L143",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:18"}), (s:SourceRef {sourceRefId: "source_ref:c0b7419220887ed2"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:e0e5aa878c187294"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L144",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:18"}), (s:SourceRef {sourceRefId: "source_ref:e0e5aa878c187294"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:405d146c0ee46379"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L145",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:18"}), (s:SourceRef {sourceRefId: "source_ref:405d146c0ee46379"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:217752f3346350f3"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L147",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:18"}), (s:SourceRef {sourceRefId: "source_ref:217752f3346350f3"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:fdafc79717d64d71"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L152",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:18"}), (s:SourceRef {sourceRefId: "source_ref:fdafc79717d64d71"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:28323424377df15b"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L153",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:18"}), (s:SourceRef {sourceRefId: "source_ref:28323424377df15b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:478898354bac38e2"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L154",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:18"}), (s:SourceRef {sourceRefId: "source_ref:478898354bac38e2"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:3263d258c4de54cb"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L155",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:18"}), (s:SourceRef {sourceRefId: "source_ref:3263d258c4de54cb"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:641ba323d96739db"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L156",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:18"}), (s:SourceRef {sourceRefId: "source_ref:641ba323d96739db"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:19"})
SET p.packetNodeId = "rg_packet:e71d3ab02f21d91b",
    p.titleId = "rg_turbovec:chunk:0019",
    p.title = "TurboVec raw search transcript chunk 19",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 360001-380000. Dominant lane: search.qdrant_vector. Snippets: 1767731880207 ERROR \"src\\\\lib\\\\services\\\\ace-web\\\\minio-service.ts\" 247:13 \"Cannot find name 'jsonContent'.\" 1767731880207 ERROR \"src\\\\lib\\\\services\\\\ace-web\\\\minio-service.ts\" 247:42 \"Cannot find name 'errorData'.\" 1767731880207 ERROR \"src\\\\lib\\\\services\\\\ace-web\\\\minio-service.ts\" 249:52 \"Cannot find name 'jsonContent'.\"",
    p.summaryHash = "4d5f941402d51ec0e8380a88c0225d2d28dbfc3b6e5db2c1c41941e25dcd864f",
    p.dumpId = "rg_turbovec",
    p.packetRank = 19,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 19";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:19"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:d8dbe67823950555"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L72175",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:19"}), (s:SourceRef {sourceRefId: "source_ref:d8dbe67823950555"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:36294a1a75055309"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L72176",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:19"}), (s:SourceRef {sourceRefId: "source_ref:36294a1a75055309"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:cd1694b633b37db1"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L72179",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:19"}), (s:SourceRef {sourceRefId: "source_ref:cd1694b633b37db1"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:8aa2b79c24377e64"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L72180",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:19"}), (s:SourceRef {sourceRefId: "source_ref:8aa2b79c24377e64"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:58f482553645a6e9"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L72181",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:19"}), (s:SourceRef {sourceRefId: "source_ref:58f482553645a6e9"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:0e537b879927b0d8"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L72182",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:19"}), (s:SourceRef {sourceRefId: "source_ref:0e537b879927b0d8"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:c79a0e148c401843"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L72183",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:19"}), (s:SourceRef {sourceRefId: "source_ref:c79a0e148c401843"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:baceec1fcb87425d"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L72184",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:19"}), (s:SourceRef {sourceRefId: "source_ref:baceec1fcb87425d"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:ca253a1f7d19a62e"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L72185",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:19"}), (s:SourceRef {sourceRefId: "source_ref:ca253a1f7d19a62e"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f1b7de2821168f58"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L72187",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:19"}), (s:SourceRef {sourceRefId: "source_ref:f1b7de2821168f58"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:84b3e496bcc7d525"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L72189",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:19"}), (s:SourceRef {sourceRefId: "source_ref:84b3e496bcc7d525"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:52b3e1aebea7c196"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-results-phase2-final.txt#L72192",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:19"}), (s:SourceRef {sourceRefId: "source_ref:52b3e1aebea7c196"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:20"})
SET p.packetNodeId = "rg_packet:9213b5674e0ff5b7",
    p.titleId = "rg_turbovec:chunk:0020",
    p.title = "TurboVec raw search transcript chunk 20",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 380001-400000. Dominant lane: search.qdrant_vector. Snippets: 1767638527686 ERROR \"src\\\\lib\\\\services\\\\enhanced-embedding-service.ts\" 6:78 \"Cannot find name 'result'.\" 1767638527686 ERROR \"src\\\\lib\\\\services\\\\enhanced-embedding-service.ts\" 6:134 \"Cannot find name 'practiceArea'.\" 1767638527686 ERROR \"src\\\\lib\\\\services\\\\enhanced-embedding-service.ts\" 6:148 \"Cannot find name 'jurisdiction'.\"",
    p.summaryHash = "225e63f8c9213656fd236700bf500281a5105da3acd68172bd55dd3bc591e80b",
    p.dumpId = "rg_turbovec",
    p.packetRank = 20,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 20";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:20"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:81f3d44e2f25b33f"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-phase2-baseline.txt#L52464",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:20"}), (s:SourceRef {sourceRefId: "source_ref:81f3d44e2f25b33f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:0ac2cfd8009946d3"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-phase2-baseline.txt#L52465",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:20"}), (s:SourceRef {sourceRefId: "source_ref:0ac2cfd8009946d3"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:5d20405d825f10a0"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-phase2-baseline.txt#L52466",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:20"}), (s:SourceRef {sourceRefId: "source_ref:5d20405d825f10a0"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:285f196130fd563c"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-phase2-baseline.txt#L52467",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:20"}), (s:SourceRef {sourceRefId: "source_ref:285f196130fd563c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:10df6483ceac7f49"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-phase2-baseline.txt#L52468",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:20"}), (s:SourceRef {sourceRefId: "source_ref:10df6483ceac7f49"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:cf76ca7478ebccca"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-phase2-baseline.txt#L52469",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:20"}), (s:SourceRef {sourceRefId: "source_ref:cf76ca7478ebccca"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:6fa08318cb07db6b"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-phase2-baseline.txt#L52471",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:20"}), (s:SourceRef {sourceRefId: "source_ref:6fa08318cb07db6b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:af2abb3b276f7e1b"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-phase2-baseline.txt#L52472",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:20"}), (s:SourceRef {sourceRefId: "source_ref:af2abb3b276f7e1b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b4fe0aa8fb0e915e"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-phase2-baseline.txt#L52473",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:20"}), (s:SourceRef {sourceRefId: "source_ref:b4fe0aa8fb0e915e"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4d4f92e46aab3462"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-phase2-baseline.txt#L52474",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:20"}), (s:SourceRef {sourceRefId: "source_ref:4d4f92e46aab3462"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:d618171f7ed5d7f3"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-phase2-baseline.txt#L52476",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:20"}), (s:SourceRef {sourceRefId: "source_ref:d618171f7ed5d7f3"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:833f8d86420f2f96"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-phase2-baseline.txt#L52478",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:20"}), (s:SourceRef {sourceRefId: "source_ref:833f8d86420f2f96"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:21"})
SET p.packetNodeId = "rg_packet:0d03be0215e2d087",
    p.titleId = "rg_turbovec:chunk:0021",
    p.title = "TurboVec raw search transcript chunk 21",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 400001-420000. Dominant lane: search.qdrant_vector. Snippets: 1763422337227 ERROR \"src\\\\lib\\\\server\\\\db\\\\schema-poi.ts\" 72:11 \"'text' cannot be used as a value because it was imported using 'import type'.\" 1763422337227 ERROR \"src\\\\lib\\\\server\\\\db\\\\schema-poi.ts\" 73:10 \"'text' cannot be used as a value because it was imported using 'import type'.\" 1763422337227 ERROR \"src\\\\lib\\\\server\\\\db\\\\schema-poi.ts\" 74:16 \"'text' cannot be used as a value because it was imported using 'import type'.\"",
    p.summaryHash = "a2fea4671c400afac4c3faa33f2b37f06380abaed5d0ccd82f1ca3f2b7824f6c",
    p.dumpId = "rg_turbovec",
    p.packetRank = 21,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 21";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:21"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:47e0cd46f8652070"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L40134",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:21"}), (s:SourceRef {sourceRefId: "source_ref:47e0cd46f8652070"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b022ba848316d843"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L40135",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:21"}), (s:SourceRef {sourceRefId: "source_ref:b022ba848316d843"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:114813aa12451f63"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L40136",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:21"}), (s:SourceRef {sourceRefId: "source_ref:114813aa12451f63"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:fc203acdd9c8aa17"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L40137",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:21"}), (s:SourceRef {sourceRefId: "source_ref:fc203acdd9c8aa17"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:c927c75c7a951fdb"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L40138",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:21"}), (s:SourceRef {sourceRefId: "source_ref:c927c75c7a951fdb"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:7ca2d8da73a9c686"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L40139",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:21"}), (s:SourceRef {sourceRefId: "source_ref:7ca2d8da73a9c686"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b8546cea70e40cf9"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L40140",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:21"}), (s:SourceRef {sourceRefId: "source_ref:b8546cea70e40cf9"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:90164094a833db77"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L40141",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:21"}), (s:SourceRef {sourceRefId: "source_ref:90164094a833db77"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:7e1b3a831fc32db9"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L40142",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:21"}), (s:SourceRef {sourceRefId: "source_ref:7e1b3a831fc32db9"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:ec6a534cdec68b84"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L40143",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:21"}), (s:SourceRef {sourceRefId: "source_ref:ec6a534cdec68b84"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:af8da45e7118ddb1"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L40144",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:21"}), (s:SourceRef {sourceRefId: "source_ref:af8da45e7118ddb1"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:66805f9b56b8e53b"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L40145",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:21"}), (s:SourceRef {sourceRefId: "source_ref:66805f9b56b8e53b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:22"})
SET p.packetNodeId = "rg_packet:a6e45d745d05a44f",
    p.titleId = "rg_turbovec:chunk:0022",
    p.title = "TurboVec raw search transcript chunk 22",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 420001-440000. Dominant lane: search.qdrant_vector. Snippets: 1763422338506 ERROR \"src\\\\routes\\\\poi-manager\\\\+page.svelte\" 447:10 \"'DialogTitle' cannot be used as a value because it was imported using 'import type'.\" 1763422338506 ERROR \"src\\\\routes\\\\poi-manager\\\\+page.svelte\" 447:38 \"'DialogTitle' cannot be used as a value because it was imported using 'import type'.\" 1763422338506 ERROR \"src\\\\routes\\\\poi-manager\\\\+page.svelte\" 448:10 \"'DialogDescription' cannot be used as a value because it was imported using 'import type'.\"",
    p.summaryHash = "8e7245364a22b82653e9c0e5d911f232f036a52fbe352ffd678ace83031421e1",
    p.dumpId = "rg_turbovec",
    p.packetRank = 22,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 22";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:22"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:d5a344b21ee323f5"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L93894",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:22"}), (s:SourceRef {sourceRefId: "source_ref:d5a344b21ee323f5"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4aff1e6aedb2215b"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L93895",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:22"}), (s:SourceRef {sourceRefId: "source_ref:4aff1e6aedb2215b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:8333bdaf68230bdf"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L93896",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:22"}), (s:SourceRef {sourceRefId: "source_ref:8333bdaf68230bdf"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:ce1a52029bafbc54"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L93897",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:22"}), (s:SourceRef {sourceRefId: "source_ref:ce1a52029bafbc54"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:9205446c11422e64"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L93898",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:22"}), (s:SourceRef {sourceRefId: "source_ref:9205446c11422e64"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:00d31501b2ded498"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L93953",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:22"}), (s:SourceRef {sourceRefId: "source_ref:00d31501b2ded498"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:d92a9f1c0b97fdd6"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L93954",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:22"}), (s:SourceRef {sourceRefId: "source_ref:d92a9f1c0b97fdd6"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:efef4c090876f5c6"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L93955",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:22"}), (s:SourceRef {sourceRefId: "source_ref:efef4c090876f5c6"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:9df60a33aab0020a"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L93956",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:22"}), (s:SourceRef {sourceRefId: "source_ref:9df60a33aab0020a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4d3791f7e0eb425a"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L93957",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:22"}), (s:SourceRef {sourceRefId: "source_ref:4d3791f7e0eb425a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4d9f775e3e98d30c"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L93958",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:22"}), (s:SourceRef {sourceRefId: "source_ref:4d9f775e3e98d30c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:55ac084a04c1a3e6"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-machine.ndjson#L93959",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:22"}), (s:SourceRef {sourceRefId: "source_ref:55ac084a04c1a3e6"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:23"})
SET p.packetNodeId = "rg_packet:890af71e42b8c21a",
    p.titleId = "rg_turbovec:chunk:0023",
    p.title = "TurboVec raw search transcript chunk 23",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 440001-460000. Dominant lane: search.qdrant_vector. Snippets: 1767642106505 ERROR \"src\\\\lib\\\\server\\\\services\\\\search\\\\pgvector-search.ts\" 149:23 \"Cannot find name 'documentId'.\" 1767642106505 ERROR \"src\\\\lib\\\\server\\\\services\\\\search\\\\pgvector-search.ts\" 149:44 \"Operator '>' cannot be applied to types 'boolean' and '{ const: any; try: { const: any; return: any; }; finally: { client: any; \\\"\\\": any; }; }'.\" 1767642106505 ERROR \"src\\\\lib\\\\server\\\\services\\\\search\\\\pgvector-search.ts\" 150:8 \"Cannot find name 'client'.\"",
    p.summaryHash = "55a761cd0eb54766c53c5f6a0f459414042cec5b32da3d5f748ff87d6eaa6772",
    p.dumpId = "rg_turbovec",
    p.packetRank = 23,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 23";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:23"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:c5335e1662fc456f"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-current.txt#L56906",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:23"}), (s:SourceRef {sourceRefId: "source_ref:c5335e1662fc456f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:1f21a68b0d2a2645"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-current.txt#L56908",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:23"}), (s:SourceRef {sourceRefId: "source_ref:1f21a68b0d2a2645"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:8afd99078f7f99a1"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-current.txt#L56910",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:23"}), (s:SourceRef {sourceRefId: "source_ref:8afd99078f7f99a1"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:2919d603da0039f0"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-current.txt#L56912",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:23"}), (s:SourceRef {sourceRefId: "source_ref:2919d603da0039f0"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:2e004ac79f9a4bb8"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-current.txt#L56913",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:23"}), (s:SourceRef {sourceRefId: "source_ref:2e004ac79f9a4bb8"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:d5c893c36eaad604"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-current.txt#L56915",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:23"}), (s:SourceRef {sourceRefId: "source_ref:d5c893c36eaad604"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:19146605276c6857"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-current.txt#L56916",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:23"}), (s:SourceRef {sourceRefId: "source_ref:19146605276c6857"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:d4477871bf4e626a"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-current.txt#L56918",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:23"}), (s:SourceRef {sourceRefId: "source_ref:d4477871bf4e626a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:3d1fad78e01d0ac0"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-current.txt#L56919",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:23"}), (s:SourceRef {sourceRefId: "source_ref:3d1fad78e01d0ac0"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:aaaf1daffd95bcb6"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-current.txt#L56931",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:23"}), (s:SourceRef {sourceRefId: "source_ref:aaaf1daffd95bcb6"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:49b75490b2eb2958"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-current.txt#L56934",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:23"}), (s:SourceRef {sourceRefId: "source_ref:49b75490b2eb2958"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:ef6ea1413e24450c"})
SET s.sourceRef = "sveltekit-frontend/svelte-check-current.txt#L56967",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:23"}), (s:SourceRef {sourceRefId: "source_ref:ef6ea1413e24450c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:24"})
SET p.packetNodeId = "rg_packet:bb5b879008bdd526",
    p.titleId = "rg_turbovec:chunk:0024",
    p.title = "TurboVec raw search transcript chunk 24",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 460001-480000. Dominant lane: search.qdrant_vector. Snippets: - **Integration**: Adapted cosine similarity and preprocessing kernels - **Usage**: Tile similarity scoring with FP16 embeddings │   ├── FP16 embedding similarity",
    p.summaryHash = "cd1aa10860755bd52ce4a58f1a42e68deca715b37567a20c6e598cf920b18d75",
    p.dumpId = "rg_turbovec",
    p.packetRank = 24,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 24";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:24"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:323932d2e90685b9"})
SET s.sourceRef = "deeds_labs/frontend/sveltekit-frontend-archive/dirs/deeds_labs/kiro-archive/MULTIMODAL_RETRIEVER_PHASE2_INTEGRATED.md#L117",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:24"}), (s:SourceRef {sourceRefId: "source_ref:323932d2e90685b9"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:6c0501f2116f1d99"})
SET s.sourceRef = "deeds_labs/frontend/sveltekit-frontend-archive/dirs/deeds_labs/kiro-archive/MULTIMODAL_RETRIEVER_PHASE2_INTEGRATED.md#L123",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:24"}), (s:SourceRef {sourceRefId: "source_ref:6c0501f2116f1d99"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:68342ea7892c0cb0"})
SET s.sourceRef = "deeds_labs/frontend/sveltekit-frontend-archive/dirs/deeds_labs/kiro-archive/MULTIMODAL_RETRIEVER_PHASE2_INTEGRATED.md#L146",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:24"}), (s:SourceRef {sourceRefId: "source_ref:68342ea7892c0cb0"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b367de8a16c642e7"})
SET s.sourceRef = "deeds_labs/frontend/sveltekit-frontend-archive/dirs/deeds_labs/kiro-archive/MULTIMODAL_RETRIEVER_PHASE2_INTEGRATED.md#L167",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:24"}), (s:SourceRef {sourceRefId: "source_ref:b367de8a16c642e7"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f541ec28eee7a8a3"})
SET s.sourceRef = "deeds_labs/frontend/sveltekit-frontend-archive/dirs/deeds_labs/kiro-archive/MULTIMODAL_RETRIEVER_INTEGRATION_SUMMARY.md#L77",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:24"}), (s:SourceRef {sourceRefId: "source_ref:f541ec28eee7a8a3"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:a24b8da9da320c1c"})
SET s.sourceRef = "deeds_labs/frontend/sveltekit-frontend-archive/dirs/deeds_labs/kiro-archive/MULTIMODAL_RETRIEVER_INTEGRATION_SUMMARY.md#L113",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:24"}), (s:SourceRef {sourceRefId: "source_ref:a24b8da9da320c1c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b77b094cab745667"})
SET s.sourceRef = "deeds_labs/frontend/sveltekit-frontend-archive/dirs/deeds_labs/kiro-archive/LEGAL_AUTO_INGESTION_COMPLETE.md#L48",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:24"}), (s:SourceRef {sourceRefId: "source_ref:b77b094cab745667"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:97d87bc09b8b8d34"})
SET s.sourceRef = "deeds_labs/frontend/sveltekit-frontend-archive/dirs/deeds_labs/kiro-archive/LEGAL_AUTO_INGESTION_COMPLETE.md#L226",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:24"}), (s:SourceRef {sourceRefId: "source_ref:97d87bc09b8b8d34"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f4f3182fd66245e2"})
SET s.sourceRef = "deeds_labs/projects/legacy-projects/ingestion-phase66/node-ingestion-api/node_modules/amqplib/lib/frame.js#L19",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:24"}), (s:SourceRef {sourceRefId: "source_ref:f4f3182fd66245e2"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:7828db09575d9071"})
SET s.sourceRef = "deeds_labs/projects/legacy-projects/ingestion-phase66/node-ingestion-api/node_modules/amqplib/lib/frame.js#L45",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:24"}), (s:SourceRef {sourceRefId: "source_ref:7828db09575d9071"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:7e989b470fb4b50d"})
SET s.sourceRef = "deeds_labs/projects/legacy-projects/ingestion-phase66/node-ingestion-api/node_modules/amqplib/lib/frame.js#L74",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:24"}), (s:SourceRef {sourceRefId: "source_ref:7e989b470fb4b50d"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:2623c2ac71d4c441"})
SET s.sourceRef = "deeds_labs/projects/legacy-projects/ingestion-phase66/node-ingestion-api/node_modules/amqplib/lib/frame.js#L77",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:24"}), (s:SourceRef {sourceRefId: "source_ref:2623c2ac71d4c441"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:25"})
SET p.packetNodeId = "rg_packet:9d48f05d124c57d8",
    p.titleId = "rg_turbovec:chunk:0025",
    p.title = "TurboVec raw search transcript chunk 25",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 480001-500000. Dominant lane: search.qdrant_vector. Snippets: * multiply the values of each channel (R, G, B, and A) of the filter image by * alpha channel of the filter image, and apply those values to the base * image's alpha channel.",
    p.summaryHash = "9c004506157d8835f460e7afc3fa03b851e622fda554e14907f52107dcd42e60",
    p.dumpId = "rg_turbovec",
    p.packetRank = 25,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 25";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:25"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:e83c4715081a3726"})
SET s.sourceRef = "node_modules/fabric/dist/index.js#L26477",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:25"}), (s:SourceRef {sourceRefId: "source_ref:e83c4715081a3726"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:aa74e2c0c5518bef"})
SET s.sourceRef = "node_modules/fabric/dist/index.js#L26479",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:25"}), (s:SourceRef {sourceRefId: "source_ref:aa74e2c0c5518bef"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:9394e19b9432402a"})
SET s.sourceRef = "node_modules/fabric/dist/index.js#L26480",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:25"}), (s:SourceRef {sourceRefId: "source_ref:9394e19b9432402a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:656e2b0dfb5d5bd6"})
SET s.sourceRef = "node_modules/fabric/dist/index.js#L27195",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:25"}), (s:SourceRef {sourceRefId: "source_ref:656e2b0dfb5d5bd6"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:8022ab0f712719fd"})
SET s.sourceRef = "node_modules/fabric/dist/index.js#L27654",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:25"}), (s:SourceRef {sourceRefId: "source_ref:8022ab0f712719fd"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:ebd988ac24d31b73"})
SET s.sourceRef = "node_modules/gpu-mock.js/README.md#L20",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:25"}), (s:SourceRef {sourceRefId: "source_ref:ebd988ac24d31b73"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f9c4846436df84d9"})
SET s.sourceRef = "node_modules/gl/angle/src/tests/gl_tests/GLSLTest.cpp#L1305",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:25"}), (s:SourceRef {sourceRefId: "source_ref:f9c4846436df84d9"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:c6140de1c5b35a46"})
SET s.sourceRef = "node_modules/gl/angle/src/tests/gl_tests/GLSLTest.cpp#L1321",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:25"}), (s:SourceRef {sourceRefId: "source_ref:c6140de1c5b35a46"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:445889b8f558d7b3"})
SET s.sourceRef = "node_modules/gl/angle/src/tests/gl_tests/FramebufferTest.cpp#L27",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:25"}), (s:SourceRef {sourceRefId: "source_ref:445889b8f558d7b3"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:dfd3eff02b37b722"})
SET s.sourceRef = "node_modules/gl/angle/src/tests/gl_tests/FramebufferTest.cpp#L32",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:25"}), (s:SourceRef {sourceRefId: "source_ref:dfd3eff02b37b722"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:7f3528677f36a753"})
SET s.sourceRef = "node_modules/gl/angle/src/tests/gl_tests/DepthStencilFormatsTest.cpp#L180",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:25"}), (s:SourceRef {sourceRefId: "source_ref:7f3528677f36a753"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:40761684b4ae5a50"})
SET s.sourceRef = "node_modules/gl/angle/src/tests/gl_tests/DepthStencilFormatsTest.cpp#L181",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:25"}), (s:SourceRef {sourceRefId: "source_ref:40761684b4ae5a50"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:26"})
SET p.packetNodeId = "rg_packet:0df9ff21848bb497",
    p.titleId = "rg_turbovec:chunk:0026",
    p.title = "TurboVec raw search transcript chunk 26",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 500001-520000. Dominant lane: search.qdrant_vector. Snippets: \u001b[31mError\u001b[39m: Cannot find name 'ClusterConfig'. \u001b[31mError\u001b[39m: Cannot find name 'health'. \u001b[36m/** * Nomic / Gemma Embedding Service (fixed) * - Default: embeddinggemma | latest (ollama) * - Fallback: nomic-embed-text: latest * - Fixed TypeScript/logic issues from original file */ import type { OllamaEmbeddings } from '@langchain/ollama'; import type { MemoryVectorSto",
    p.summaryHash = "1dc2fc3919849c924a80e7d23cf5227bb573badac252b8b261ce513b15730770",
    p.dumpId = "rg_turbovec",
    p.packetRank = 26,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 26";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:26"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:bdc311e6ec835c22"})
SET s.sourceRef = "sveltekit-frontend/src/lib/server/db/error_analysis.txt#L164587",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:26"}), (s:SourceRef {sourceRefId: "source_ref:bdc311e6ec835c22"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:44a04ad8cfbd5e89"})
SET s.sourceRef = "sveltekit-frontend/src/lib/server/db/error_analysis.txt#L164618",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:26"}), (s:SourceRef {sourceRefId: "source_ref:44a04ad8cfbd5e89"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b48f07687b276894"})
SET s.sourceRef = "sveltekit-frontend/src/lib/server/db/error_analysis.txt#L164624",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:26"}), (s:SourceRef {sourceRefId: "source_ref:b48f07687b276894"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:7919effb102a2c49"})
SET s.sourceRef = "sveltekit-frontend/src/lib/server/db/error_analysis.txt#L164628",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:26"}), (s:SourceRef {sourceRefId: "source_ref:7919effb102a2c49"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4935a9ae3dc9a010"})
SET s.sourceRef = "sveltekit-frontend/src/lib/server/db/error_analysis.txt#L164632",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:26"}), (s:SourceRef {sourceRefId: "source_ref:4935a9ae3dc9a010"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:7acb75861e4b1310"})
SET s.sourceRef = "sveltekit-frontend/src/lib/server/db/error_analysis.txt#L164636",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:26"}), (s:SourceRef {sourceRefId: "source_ref:7acb75861e4b1310"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:01d4beec9cd081b2"})
SET s.sourceRef = "sveltekit-frontend/src/lib/server/db/error_analysis.txt#L164640",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:26"}), (s:SourceRef {sourceRefId: "source_ref:01d4beec9cd081b2"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:ee2cca7b82723c20"})
SET s.sourceRef = "sveltekit-frontend/src/lib/server/db/error_analysis.txt#L164644",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:26"}), (s:SourceRef {sourceRefId: "source_ref:ee2cca7b82723c20"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:a97fcbf8431dd03d"})
SET s.sourceRef = "sveltekit-frontend/src/lib/server/db/error_analysis.txt#L164648",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:26"}), (s:SourceRef {sourceRefId: "source_ref:a97fcbf8431dd03d"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:eae25b28be37071c"})
SET s.sourceRef = "sveltekit-frontend/src/lib/server/db/error_analysis.txt#L164873",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:26"}), (s:SourceRef {sourceRefId: "source_ref:eae25b28be37071c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:1cc9b2c85652199b"})
SET s.sourceRef = "sveltekit-frontend/src/lib/server/db/error_analysis.txt#L164879",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:26"}), (s:SourceRef {sourceRefId: "source_ref:1cc9b2c85652199b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f2be8d53df671b8e"})
SET s.sourceRef = "sveltekit-frontend/src/lib/server/db/error_analysis.txt#L164885",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:26"}), (s:SourceRef {sourceRefId: "source_ref:f2be8d53df671b8e"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:27"})
SET p.packetNodeId = "rg_packet:693a7857eb1c2ea0",
    p.titleId = "rg_turbovec:chunk:0027",
    p.title = "TurboVec raw search transcript chunk 27",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 520001-540000. Dominant lane: search.qdrant_vector. Snippets: \u001b[31mError\u001b[39m: Cannot find module './RegisterModal.svelte' or its corresponding type declarations. \u001b[31mError\u001b[39m: Cannot use `$props()` more than once \u001b[31mError\u001b[39m: Cannot redeclare block-scoped variable 'domain'. (ts)",
    p.summaryHash = "1c01ab1320b7d3505d1114d5c81d670f6b1381d29784ad746a6ae5c4312dc261",
    p.dumpId = "rg_turbovec",
    p.packetRank = 27,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 27";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:27"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:b3b196844180b6e0"})
SET s.sourceRef = "sveltekit-frontend/check_results_2.txt#L5111",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:27"}), (s:SourceRef {sourceRefId: "source_ref:b3b196844180b6e0"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b8a1d9997df5ad06"})
SET s.sourceRef = "sveltekit-frontend/check_results_2.txt#L5155",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:27"}), (s:SourceRef {sourceRefId: "source_ref:b8a1d9997df5ad06"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:706134004a04897d"})
SET s.sourceRef = "sveltekit-frontend/check_results_2.txt#L5341",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:27"}), (s:SourceRef {sourceRefId: "source_ref:706134004a04897d"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:e67ccd3785e008d3"})
SET s.sourceRef = "sveltekit-frontend/check_results_2.txt#L5346",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:27"}), (s:SourceRef {sourceRefId: "source_ref:e67ccd3785e008d3"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:a5ed4bf09a7459b6"})
SET s.sourceRef = "sveltekit-frontend/check_results_2.txt#L5365",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:27"}), (s:SourceRef {sourceRefId: "source_ref:a5ed4bf09a7459b6"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:85001fa167b9cf76"})
SET s.sourceRef = "sveltekit-frontend/check_results_2.txt#L5370",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:27"}), (s:SourceRef {sourceRefId: "source_ref:85001fa167b9cf76"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:d4e69c3518db8d6a"})
SET s.sourceRef = "sveltekit-frontend/check_results_2.txt#L5577",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:27"}), (s:SourceRef {sourceRefId: "source_ref:d4e69c3518db8d6a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:8349a24c692fa24b"})
SET s.sourceRef = "sveltekit-frontend/check_results_2.txt#L5598",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:27"}), (s:SourceRef {sourceRefId: "source_ref:8349a24c692fa24b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:12230d07262a645a"})
SET s.sourceRef = "sveltekit-frontend/check_results_2.txt#L5604",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:27"}), (s:SourceRef {sourceRefId: "source_ref:12230d07262a645a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:0f722ae5ec674633"})
SET s.sourceRef = "sveltekit-frontend/check_results_2.txt#L5612",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:27"}), (s:SourceRef {sourceRefId: "source_ref:0f722ae5ec674633"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b49b190b771920e9"})
SET s.sourceRef = "sveltekit-frontend/check_results_2.txt#L5619",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:27"}), (s:SourceRef {sourceRefId: "source_ref:b49b190b771920e9"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:5621b92e407515b0"})
SET s.sourceRef = "sveltekit-frontend/check_results_2.txt#L5653",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:27"}), (s:SourceRef {sourceRefId: "source_ref:5621b92e407515b0"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:28"})
SET p.packetNodeId = "rg_packet:1f3112543e8aa97d",
    p.titleId = "rg_turbovec:chunk:0028",
    p.title = "TurboVec raw search transcript chunk 28",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 540001-560000. Dominant lane: search.qdrant_vector. Snippets: \u001b[31mError\u001b[39m: Cannot find name 'EnhancedLegalCaseEvent'. \u001b[31mError\u001b[39m: Cannot find name 'onDone'. \u001b[31mError\u001b[39m: Cannot find name 'actions'.",
    p.summaryHash = "b9929c2e41dd47ae7755a002d909d1cb4fa11b2d32109027c025206e71278091",
    p.dumpId = "rg_turbovec",
    p.packetRank = 28,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 28";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:28"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:adedc1fe8af3fda2"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L169818",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:28"}), (s:SourceRef {sourceRefId: "source_ref:adedc1fe8af3fda2"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:0ab370cc20c99259"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L169824",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:28"}), (s:SourceRef {sourceRefId: "source_ref:0ab370cc20c99259"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4771484c9c2d64a4"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L169836",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:28"}), (s:SourceRef {sourceRefId: "source_ref:4771484c9c2d64a4"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4fd2b7d438643044"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L169848",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:28"}), (s:SourceRef {sourceRefId: "source_ref:4fd2b7d438643044"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:15b04c1160f1ec99"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L169854",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:28"}), (s:SourceRef {sourceRefId: "source_ref:15b04c1160f1ec99"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:934fc454494391bc"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L169866",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:28"}), (s:SourceRef {sourceRefId: "source_ref:934fc454494391bc"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:19e823f0c4c8d401"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L169878",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:28"}), (s:SourceRef {sourceRefId: "source_ref:19e823f0c4c8d401"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:04b4e5624cfe7a43"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L169884",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:28"}), (s:SourceRef {sourceRefId: "source_ref:04b4e5624cfe7a43"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:3c14d390f07e9279"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L169896",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:28"}), (s:SourceRef {sourceRefId: "source_ref:3c14d390f07e9279"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:464e69310dd563cb"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L169908",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:28"}), (s:SourceRef {sourceRefId: "source_ref:464e69310dd563cb"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:5e060c82926ce5a8"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L169921",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:28"}), (s:SourceRef {sourceRefId: "source_ref:5e060c82926ce5a8"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:de9fa35434936da1"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L169935",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:28"}), (s:SourceRef {sourceRefId: "source_ref:de9fa35434936da1"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:29"})
SET p.packetNodeId = "rg_packet:0e63413c4509cebc",
    p.titleId = "rg_turbovec:chunk:0029",
    p.title = "TurboVec raw search transcript chunk 29",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 560001-580000. Dominant lane: search.qdrant_vector. Snippets: \u001b[31mError\u001b[39m: 'string' cannot be used as a value because it was imported using 'import type'. \u001b[31mError\u001b[39m: Operator '<' cannot be applied to types 'PromiseConstructor' and 'typeof TestProject'. \u001b[31mError\u001b[39m: The value 'null' cannot be used here.",
    p.summaryHash = "b0f931d49d722e77ade5e31ab127df5d49a99852f1a39f0f6ebd205742d20db5",
    p.dumpId = "rg_turbovec",
    p.packetRank = 29,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 29";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:29"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:d1051ec9b370b016"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L451176",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:29"}), (s:SourceRef {sourceRefId: "source_ref:d1051ec9b370b016"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:e29ffb78d7c81b76"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L451188",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:29"}), (s:SourceRef {sourceRefId: "source_ref:e29ffb78d7c81b76"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:60e1e7fb307ae825"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L451202",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:29"}), (s:SourceRef {sourceRefId: "source_ref:60e1e7fb307ae825"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f01d267d9ccba125"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L451214",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:29"}), (s:SourceRef {sourceRefId: "source_ref:f01d267d9ccba125"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:dc9dcfeccf447a18"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L451226",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:29"}), (s:SourceRef {sourceRefId: "source_ref:dc9dcfeccf447a18"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:6d8dbf3e4097ae3d"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L451238",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:29"}), (s:SourceRef {sourceRefId: "source_ref:6d8dbf3e4097ae3d"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4855df71fe467227"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L451244",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:29"}), (s:SourceRef {sourceRefId: "source_ref:4855df71fe467227"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f5fb87490c49fb00"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L451262",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:29"}), (s:SourceRef {sourceRefId: "source_ref:f5fb87490c49fb00"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:559c412019e1ec7e"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L451280",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:29"}), (s:SourceRef {sourceRefId: "source_ref:559c412019e1ec7e"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:70371e7c4663ac6e"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L451298",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:29"}), (s:SourceRef {sourceRefId: "source_ref:70371e7c4663ac6e"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:a400e9c53ada8326"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L451316",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:29"}), (s:SourceRef {sourceRefId: "source_ref:a400e9c53ada8326"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4e99f05c88e2ca67"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L451328",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:29"}), (s:SourceRef {sourceRefId: "source_ref:4e99f05c88e2ca67"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:30"})
SET p.packetNodeId = "rg_packet:4467e339e2f77f22",
    p.titleId = "rg_turbovec:chunk:0030",
    p.title = "TurboVec raw search transcript chunk 30",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 580001-600000. Dominant lane: search.qdrant_vector. Snippets: \u001b[31mError\u001b[39m: Cannot find name 'dbSync'. \u001b[31mError\u001b[39m: Cannot find name 'options'. \u001b[31mError\u001b[39m: Cannot find name 'get'.",
    p.summaryHash = "0b1eacd5d5d88c4d87cfea15ee8be1ab745b4c10ca7aed6bd98ba7a1fe3cd1dc",
    p.dumpId = "rg_turbovec",
    p.packetRank = 30,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 30";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:30"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:3290991273c800e0"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L722099",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:30"}), (s:SourceRef {sourceRefId: "source_ref:3290991273c800e0"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:0b67a60b53b40785"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L722105",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:30"}), (s:SourceRef {sourceRefId: "source_ref:0b67a60b53b40785"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f3e744f149fc0801"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L722111",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:30"}), (s:SourceRef {sourceRefId: "source_ref:f3e744f149fc0801"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:06e6d6d4b2328838"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L722117",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:30"}), (s:SourceRef {sourceRefId: "source_ref:06e6d6d4b2328838"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:6442d0653de0d380"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L722123",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:30"}), (s:SourceRef {sourceRefId: "source_ref:6442d0653de0d380"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:25a8135d83a04ae2"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L722129",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:30"}), (s:SourceRef {sourceRefId: "source_ref:25a8135d83a04ae2"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f6eb9f3305b98aa9"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L722135",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:30"}), (s:SourceRef {sourceRefId: "source_ref:f6eb9f3305b98aa9"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:ef1addd00f5ee4d3"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L722147",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:30"}), (s:SourceRef {sourceRefId: "source_ref:ef1addd00f5ee4d3"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f770d47e6c5ae14b"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L722153",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:30"}), (s:SourceRef {sourceRefId: "source_ref:f770d47e6c5ae14b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:6ec33c8635b82c10"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L722165",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:30"}), (s:SourceRef {sourceRefId: "source_ref:6ec33c8635b82c10"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:333af7245371597d"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L722171",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:30"}), (s:SourceRef {sourceRefId: "source_ref:333af7245371597d"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:5065f338be3b9dea"})
SET s.sourceRef = "sveltekit-frontend/error-log.txt#L722183",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:30"}), (s:SourceRef {sourceRefId: "source_ref:5065f338be3b9dea"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:31"})
SET p.packetNodeId = "rg_packet:146292d5fdd90608",
    p.titleId = "rg_turbovec:chunk:0031",
    p.title = "TurboVec raw search transcript chunk 31",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 600001-620000. Dominant lane: search.qdrant_vector. Snippets: 1767401785760 {\"type\":\"ERROR\",\"filename\":\"src\\\\lib\\\\services\\\\ollama-suggestions-service.ts\",\"start\":{\"line\":13,\"character\":1724},\"end\":{\"line\":13,\"character\":1725},\"message\":\"Cannot find name '$'. Do you need to install type definitions for jQuery? Try `npm i --save-dev @types/j 1767401785760 {\"type\":\"ERROR\",\"filename\":\"src\\\\lib\\\\services\\\\ollama-suggestions-service.ts\",\"start\":{\"line\":13,\"character\":1726},\"end\":{\"line\":13,\"character\":1734},\"message\":\"Cannot find name 'response'.\",\"code\":2304} 1767401785760 {\"type\":\"ERROR\",\"filename\":\"src\\\\lib\\\\services\\\\ollama-suggestions-service.ts\",\"start\":{\"line\":16,\"character\":3520},\"end\":{\"line\":16,\"character\":3533},\"message\":\"Cannot find name 'text_fallback'.\",\"code\":2304}",
    p.summaryHash = "0eb67af366a242b67812e4be9f5f0136bd4a270625e5172e43bbdd2a154e1200",
    p.dumpId = "rg_turbovec",
    p.packetRank = 31,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 31";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:31"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:884d9b9c7162ee98"})
SET s.sourceRef = "sveltekit-frontend/error-analysis.txt#L52438",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:31"}), (s:SourceRef {sourceRefId: "source_ref:884d9b9c7162ee98"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:79a5e2ca5dc582e7"})
SET s.sourceRef = "sveltekit-frontend/error-analysis.txt#L52439",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:31"}), (s:SourceRef {sourceRefId: "source_ref:79a5e2ca5dc582e7"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:ff666d54d233456f"})
SET s.sourceRef = "sveltekit-frontend/error-analysis.txt#L52440",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:31"}), (s:SourceRef {sourceRefId: "source_ref:ff666d54d233456f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:369fbbcf03f81565"})
SET s.sourceRef = "sveltekit-frontend/error-analysis.txt#L52441",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:31"}), (s:SourceRef {sourceRefId: "source_ref:369fbbcf03f81565"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f8f65e58a12c442f"})
SET s.sourceRef = "sveltekit-frontend/error-analysis.txt#L52442",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:31"}), (s:SourceRef {sourceRefId: "source_ref:f8f65e58a12c442f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:89b046c7b8941f02"})
SET s.sourceRef = "sveltekit-frontend/error-analysis.txt#L52443",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:31"}), (s:SourceRef {sourceRefId: "source_ref:89b046c7b8941f02"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:92bdfccc51740652"})
SET s.sourceRef = "sveltekit-frontend/error-analysis.txt#L52444",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:31"}), (s:SourceRef {sourceRefId: "source_ref:92bdfccc51740652"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:343668863b763703"})
SET s.sourceRef = "sveltekit-frontend/error-analysis.txt#L52445",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:31"}), (s:SourceRef {sourceRefId: "source_ref:343668863b763703"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:d8f942e406145ba0"})
SET s.sourceRef = "sveltekit-frontend/error-analysis.txt#L52446",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:31"}), (s:SourceRef {sourceRefId: "source_ref:d8f942e406145ba0"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:3b71199687841b6c"})
SET s.sourceRef = "sveltekit-frontend/error-analysis.txt#L52447",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:31"}), (s:SourceRef {sourceRefId: "source_ref:3b71199687841b6c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:53827d1866543e66"})
SET s.sourceRef = "sveltekit-frontend/error-analysis.txt#L52448",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:31"}), (s:SourceRef {sourceRefId: "source_ref:53827d1866543e66"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f8691ec34ac7085f"})
SET s.sourceRef = "sveltekit-frontend/error-analysis.txt#L52449",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:31"}), (s:SourceRef {sourceRefId: "source_ref:f8691ec34ac7085f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:32"})
SET p.packetNodeId = "rg_packet:b402b59a8a8bc65c",
    p.titleId = "rg_turbovec:chunk:0032",
    p.title = "TurboVec raw search transcript chunk 32",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 620001-640000. Dominant lane: search.qdrant_vector. Snippets: 1768779787157 ERROR \"src\\\\pgvector-search.ts\" 100:2 \"Cannot find name 'async'.\" 1768779787157 ERROR \"src\\\\pgvector-search.ts\" 100:8 \"Cannot find name 'search'.\" 1768779787157 ERROR \"src\\\\pgvector-search.ts\" 101:3 \"Cannot find name 'queryEmbedding'.\"",
    p.summaryHash = "51ce8fe91a8d7d189115aed30a4f73aedd32a3d35fa0f713b6166873d36076bf",
    p.dumpId = "rg_turbovec",
    p.packetRank = 32,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 32";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:32"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:a4a5be8332725639"})
SET s.sourceRef = "sveltekit-frontend/error_log.txt#L2600",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:32"}), (s:SourceRef {sourceRefId: "source_ref:a4a5be8332725639"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f547a604dcabb992"})
SET s.sourceRef = "sveltekit-frontend/error_log.txt#L2601",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:32"}), (s:SourceRef {sourceRefId: "source_ref:f547a604dcabb992"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:949c1da275ca389c"})
SET s.sourceRef = "sveltekit-frontend/error_log.txt#L2602",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:32"}), (s:SourceRef {sourceRefId: "source_ref:949c1da275ca389c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:7e787f8f2fd47ccf"})
SET s.sourceRef = "sveltekit-frontend/error_log.txt#L2604",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:32"}), (s:SourceRef {sourceRefId: "source_ref:7e787f8f2fd47ccf"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b5c4df37ce0ec9e4"})
SET s.sourceRef = "sveltekit-frontend/error_log.txt#L2605",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:32"}), (s:SourceRef {sourceRefId: "source_ref:b5c4df37ce0ec9e4"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f9dfab7bd1713d54"})
SET s.sourceRef = "sveltekit-frontend/error_log.txt#L2606",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:32"}), (s:SourceRef {sourceRefId: "source_ref:f9dfab7bd1713d54"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:10917112f2079e91"})
SET s.sourceRef = "sveltekit-frontend/error_log.txt#L2608",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:32"}), (s:SourceRef {sourceRefId: "source_ref:10917112f2079e91"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:8336b9a753e375fc"})
SET s.sourceRef = "sveltekit-frontend/error_log.txt#L2612",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:32"}), (s:SourceRef {sourceRefId: "source_ref:8336b9a753e375fc"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4dfea20ea262b0d9"})
SET s.sourceRef = "sveltekit-frontend/error_log.txt#L2613",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:32"}), (s:SourceRef {sourceRefId: "source_ref:4dfea20ea262b0d9"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:e5590e5de828ab6e"})
SET s.sourceRef = "sveltekit-frontend/error_log.txt#L2614",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:32"}), (s:SourceRef {sourceRefId: "source_ref:e5590e5de828ab6e"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:d07b6e3b71e46ac0"})
SET s.sourceRef = "sveltekit-frontend/error_log.txt#L2616",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:32"}), (s:SourceRef {sourceRefId: "source_ref:d07b6e3b71e46ac0"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:8d776da8566f28a7"})
SET s.sourceRef = "sveltekit-frontend/error_log.txt#L2618",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:32"}), (s:SourceRef {sourceRefId: "source_ref:8d776da8566f28a7"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:33"})
SET p.packetNodeId = "rg_packet:ba9cf2d55a11666d",
    p.titleId = "rg_turbovec:chunk:0033",
    p.title = "TurboVec raw search transcript chunk 33",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 640001-660000. Dominant lane: search.qdrant_vector. Snippets: 1767824519094 ERROR \"src\\\\lib\\\\api\\\\enhanced-rest-architecture.ts\" 100:34 \"Cannot find name 'config'.\" 1767824519094 ERROR \"src\\\\lib\\\\api\\\\enhanced-rest-architecture.ts\" 100:61 \"Operator '<' cannot be applied to types 'boolean' and 'number'.\" 1767824519096 ERROR \"src\\\\lib\\\\api\\\\enhanced-case-api.ts\" 84:9 \"The value 'undefined' cannot be used here.\"",
    p.summaryHash = "27e54ce3b7232941468326eab406ce9eae12c9e7b528be0d8c9e82320156846c",
    p.dumpId = "rg_turbovec",
    p.packetRank = 33,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 33";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:33"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:3e5cab4fdc374df0"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L1382",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:33"}), (s:SourceRef {sourceRefId: "source_ref:3e5cab4fdc374df0"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b6916cd3c1aaf4ad"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L1384",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:33"}), (s:SourceRef {sourceRefId: "source_ref:b6916cd3c1aaf4ad"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:dd0b215ab5b12862"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L1497",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:33"}), (s:SourceRef {sourceRefId: "source_ref:dd0b215ab5b12862"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:d4c56dba44d321bf"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L1498",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:33"}), (s:SourceRef {sourceRefId: "source_ref:d4c56dba44d321bf"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:fc5acc3c67af2a3d"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L1499",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:33"}), (s:SourceRef {sourceRefId: "source_ref:fc5acc3c67af2a3d"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f1098a10680066f2"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L1502",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:33"}), (s:SourceRef {sourceRefId: "source_ref:f1098a10680066f2"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4647d970c8e29069"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L1506",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:33"}), (s:SourceRef {sourceRefId: "source_ref:4647d970c8e29069"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:addecccf72c84042"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L1514",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:33"}), (s:SourceRef {sourceRefId: "source_ref:addecccf72c84042"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:2792ebab65912dbe"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L1515",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:33"}), (s:SourceRef {sourceRefId: "source_ref:2792ebab65912dbe"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:5ddc66f04c2b2517"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L1516",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:33"}), (s:SourceRef {sourceRefId: "source_ref:5ddc66f04c2b2517"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:c46aa0d3f5f646fa"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L1517",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:33"}), (s:SourceRef {sourceRefId: "source_ref:c46aa0d3f5f646fa"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:71c5e99cf45b94e6"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L1519",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:33"}), (s:SourceRef {sourceRefId: "source_ref:71c5e99cf45b94e6"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:34"})
SET p.packetNodeId = "rg_packet:b5f4de5f1f977416",
    p.titleId = "rg_turbovec:chunk:0034",
    p.title = "TurboVec raw search transcript chunk 34",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 660001-680000. Dominant lane: search.qdrant_vector. Snippets: 1767824519751 ERROR \"src\\\\lib\\\\gpu\\\\runtime-optimizations.ts\" 61:2 \"Cannot find name 'EMBEDDING_CACHE_TTL'.\" 1767824519751 ERROR \"src\\\\lib\\\\gpu\\\\runtime-optimizations.ts\" 64:2 \"Cannot find name 'LEGAL_DOC_BATCH_SIZE'.\" 1767824519751 ERROR \"src\\\\lib\\\\gpu\\\\runtime-optimizations.ts\" 65:2 \"Cannot find name 'LEGAL_DOC_MAX_CONCURRENCY'.\"",
    p.summaryHash = "74d4e52297e7b3a6eda94a8bf15ac98798235e5645db6221de348e64c591f3a5",
    p.dumpId = "rg_turbovec",
    p.packetRank = 34,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 34";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:34"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:b24b3bb300a1234f"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L76312",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:34"}), (s:SourceRef {sourceRefId: "source_ref:b24b3bb300a1234f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:e919ff9b2144e106"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L76313",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:34"}), (s:SourceRef {sourceRefId: "source_ref:e919ff9b2144e106"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:509218197103a8c1"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L76314",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:34"}), (s:SourceRef {sourceRefId: "source_ref:509218197103a8c1"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:2157e5f0fcaf847c"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L76315",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:34"}), (s:SourceRef {sourceRefId: "source_ref:2157e5f0fcaf847c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:00abf54cdf6644cf"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L76316",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:34"}), (s:SourceRef {sourceRefId: "source_ref:00abf54cdf6644cf"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:2076188c65ae93ae"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L76317",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:34"}), (s:SourceRef {sourceRefId: "source_ref:2076188c65ae93ae"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:655556ece158b338"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L76318",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:34"}), (s:SourceRef {sourceRefId: "source_ref:655556ece158b338"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:5a320c5a81eb0895"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L76319",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:34"}), (s:SourceRef {sourceRefId: "source_ref:5a320c5a81eb0895"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:395eec859bfc8152"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L76320",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:34"}), (s:SourceRef {sourceRefId: "source_ref:395eec859bfc8152"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:fc35605d3507b42d"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L76321",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:34"}), (s:SourceRef {sourceRefId: "source_ref:fc35605d3507b42d"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:11cb1d5173b52ef6"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L76329",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:34"}), (s:SourceRef {sourceRefId: "source_ref:11cb1d5173b52ef6"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:2b4a16bce30205d2"})
SET s.sourceRef = "sveltekit-frontend/errors-phase76-4.txt#L76330",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:34"}), (s:SourceRef {sourceRefId: "source_ref:2b4a16bce30205d2"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:35"})
SET p.packetNodeId = "rg_packet:f1b5cce0215b82bb",
    p.titleId = "rg_turbovec:chunk:0035",
    p.title = "TurboVec raw search transcript chunk 35",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 680001-700000. Dominant lane: search.qdrant_vector. Snippets: \u001b[31mError\u001b[39m: Cannot find name 'subspaceSize'. \u001b[31mError\u001b[39m: Cannot find name 'subspaceSize'. \u001b[31mError\u001b[39m: Cannot find name 'vector'.",
    p.summaryHash = "6cca0dbc5112d5d1f0f6eaebee45b0a9a35eef3cc10f5269b65e20d85e2b5e9a",
    p.dumpId = "rg_turbovec",
    p.packetRank = 35,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 35";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:35"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:aec27e477ebf008d"})
SET s.sourceRef = "sveltekit-frontend/errors-output.txt#L392836",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:35"}), (s:SourceRef {sourceRefId: "source_ref:aec27e477ebf008d"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:d1ffdda838bc2023"})
SET s.sourceRef = "sveltekit-frontend/errors-output.txt#L392842",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:35"}), (s:SourceRef {sourceRefId: "source_ref:d1ffdda838bc2023"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:687332f7ab982328"})
SET s.sourceRef = "sveltekit-frontend/errors-output.txt#L392860",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:35"}), (s:SourceRef {sourceRefId: "source_ref:687332f7ab982328"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:7eda69e7bc35ba36"})
SET s.sourceRef = "sveltekit-frontend/errors-output.txt#L392866",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:35"}), (s:SourceRef {sourceRefId: "source_ref:7eda69e7bc35ba36"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:36b2a1e5af479844"})
SET s.sourceRef = "sveltekit-frontend/errors-output.txt#L392877",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:35"}), (s:SourceRef {sourceRefId: "source_ref:36b2a1e5af479844"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:40b241e1299dfe6e"})
SET s.sourceRef = "sveltekit-frontend/errors-output.txt#L392882",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:35"}), (s:SourceRef {sourceRefId: "source_ref:40b241e1299dfe6e"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:ffe936e35c016ddc"})
SET s.sourceRef = "sveltekit-frontend/errors-output.txt#L392906",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:35"}), (s:SourceRef {sourceRefId: "source_ref:ffe936e35c016ddc"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b5274c7f7cef9a6f"})
SET s.sourceRef = "sveltekit-frontend/errors-output.txt#L392912",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:35"}), (s:SourceRef {sourceRefId: "source_ref:b5274c7f7cef9a6f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:948dc4e87ae12e6a"})
SET s.sourceRef = "sveltekit-frontend/errors-output.txt#L392918",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:35"}), (s:SourceRef {sourceRefId: "source_ref:948dc4e87ae12e6a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:1abaa28c46ed9b40"})
SET s.sourceRef = "sveltekit-frontend/errors-output.txt#L392924",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:35"}), (s:SourceRef {sourceRefId: "source_ref:1abaa28c46ed9b40"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:fcc1719cd7ec7963"})
SET s.sourceRef = "sveltekit-frontend/errors-output.txt#L392930",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:35"}), (s:SourceRef {sourceRefId: "source_ref:fcc1719cd7ec7963"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:edfc7639bc081d59"})
SET s.sourceRef = "sveltekit-frontend/errors-output.txt#L392942",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:35"}), (s:SourceRef {sourceRefId: "source_ref:edfc7639bc081d59"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:36"})
SET p.packetNodeId = "rg_packet:a6be51db17cdd326",
    p.titleId = "rg_turbovec:chunk:0036",
    p.title = "TurboVec raw search transcript chunk 36",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 700001-720000. Dominant lane: search.qdrant_vector. Snippets: \"code\": \"Cannot find name 'RequestOptions'.\", \"code\": \"Cannot find name 'useRedis'.\", \"code\": \"Cannot find name 'initializeRedis'.\",",
    p.summaryHash = "f14b2babc8a5e08efccc0a0bc7e826d26b554995b280b6f8b2e250883198947b",
    p.dumpId = "rg_turbovec",
    p.packetRank = 36,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 36";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:36"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:d3f6bb6a19ed81dd"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/error-top1000.json#L179696",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:36"}), (s:SourceRef {sourceRefId: "source_ref:d3f6bb6a19ed81dd"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:5c257f7a99bb150f"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/error-top1000.json#L179726",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:36"}), (s:SourceRef {sourceRefId: "source_ref:5c257f7a99bb150f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:500341167265429f"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/error-top1000.json#L179736",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:36"}), (s:SourceRef {sourceRefId: "source_ref:500341167265429f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:243f72a2c3819916"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/error-top1000.json#L179746",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:36"}), (s:SourceRef {sourceRefId: "source_ref:243f72a2c3819916"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:aa1fa462f94485cc"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/error-top1000.json#L179756",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:36"}), (s:SourceRef {sourceRefId: "source_ref:aa1fa462f94485cc"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:dec0be39dc55dd68"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/error-top1000.json#L179766",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:36"}), (s:SourceRef {sourceRefId: "source_ref:dec0be39dc55dd68"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4fbc3b3c982ec51d"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/error-top1000.json#L179776",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:36"}), (s:SourceRef {sourceRefId: "source_ref:4fbc3b3c982ec51d"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:3e5ca880233dbd45"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/error-top1000.json#L179786",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:36"}), (s:SourceRef {sourceRefId: "source_ref:3e5ca880233dbd45"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b1a1f533046cbc95"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/error-top1000.json#L179796",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:36"}), (s:SourceRef {sourceRefId: "source_ref:b1a1f533046cbc95"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:69b6a1b2bfbd2f34"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/error-top1000.json#L179806",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:36"}), (s:SourceRef {sourceRefId: "source_ref:69b6a1b2bfbd2f34"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:51137918e41faa87"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/error-top1000.json#L179816",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:36"}), (s:SourceRef {sourceRefId: "source_ref:51137918e41faa87"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:2da8e867b2d16c61"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/error-top1000.json#L179826",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:36"}), (s:SourceRef {sourceRefId: "source_ref:2da8e867b2d16c61"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:37"})
SET p.packetNodeId = "rg_packet:44af451405a7de6e",
    p.titleId = "rg_turbovec:chunk:0037",
    p.title = "TurboVec raw search transcript chunk 37",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 720001-740000. Dominant lane: search.qdrant_vector. Snippets: \"Option_0_cannot_be_specified_without_specifying_option_1_or_option_2_5069\": \"指定選項 '{0}' 時，必須指定選項 '{1}' 或選項 '{2}'。\", \"Option_preserveConstEnums_cannot_be_disabled_when_isolatedModules_is_enabled_5091\": \"啟用 'isolatedModules' 時，無法停用選項 'preserveConstEnums'。\", \"Option_project_cannot_be_mixed_with_source_files_on_a_command_line_5042\": \"在命令列上，'project' 選項不得與原始程式檔並用。\",",
    p.summaryHash = "c7e8af9cfa5b5e548559ceb8bf4576137a5900c81102fb18c137ea94ef3fab55",
    p.dumpId = "rg_turbovec",
    p.packetRank = 37,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 37";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:37"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:a465b68674d68327"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@bufbuild/protoplugin/node_modules/typescript/lib/zh-tw/diagnosticMessages.generated.json#L1014",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:37"}), (s:SourceRef {sourceRefId: "source_ref:a465b68674d68327"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b9fc070311052a5a"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@bufbuild/protoplugin/node_modules/typescript/lib/zh-tw/diagnosticMessages.generated.json#L1018",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:37"}), (s:SourceRef {sourceRefId: "source_ref:b9fc070311052a5a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:5bffa3ba02cb68cc"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@bufbuild/protoplugin/node_modules/typescript/lib/zh-tw/diagnosticMessages.generated.json#L1020",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:37"}), (s:SourceRef {sourceRefId: "source_ref:5bffa3ba02cb68cc"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:bd42fc0eded1e26e"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@bufbuild/protoplugin/node_modules/typescript/lib/zh-tw/diagnosticMessages.generated.json#L1022",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:37"}), (s:SourceRef {sourceRefId: "source_ref:bd42fc0eded1e26e"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4a4fd6fc5768e32e"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@bufbuild/protoplugin/node_modules/typescript/lib/zh-tw/diagnosticMessages.generated.json#L1023",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:37"}), (s:SourceRef {sourceRefId: "source_ref:4a4fd6fc5768e32e"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:07c069a37957651b"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@bufbuild/protoplugin/node_modules/typescript/lib/zh-tw/diagnosticMessages.generated.json#L1039",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:37"}), (s:SourceRef {sourceRefId: "source_ref:07c069a37957651b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4eaa660f214ecc2e"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@bufbuild/protoplugin/node_modules/typescript/lib/zh-tw/diagnosticMessages.generated.json#L1040",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:37"}), (s:SourceRef {sourceRefId: "source_ref:4eaa660f214ecc2e"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:555666cc9a521ad6"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@bufbuild/protoplugin/node_modules/typescript/lib/zh-tw/diagnosticMessages.generated.json#L1044",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:37"}), (s:SourceRef {sourceRefId: "source_ref:555666cc9a521ad6"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f37f723fe02de389"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@bufbuild/protoplugin/node_modules/typescript/lib/zh-tw/diagnosticMessages.generated.json#L1054",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:37"}), (s:SourceRef {sourceRefId: "source_ref:f37f723fe02de389"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:0018fdd41a497801"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@bufbuild/protoplugin/node_modules/typescript/lib/zh-tw/diagnosticMessages.generated.json#L1067",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:37"}), (s:SourceRef {sourceRefId: "source_ref:0018fdd41a497801"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:e9b5538744763730"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@bufbuild/protoplugin/node_modules/typescript/lib/zh-tw/diagnosticMessages.generated.json#L1100",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:37"}), (s:SourceRef {sourceRefId: "source_ref:e9b5538744763730"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f5d4fb0c889ebeec"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@bufbuild/protoplugin/node_modules/typescript/lib/zh-tw/diagnosticMessages.generated.json#L1101",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:37"}), (s:SourceRef {sourceRefId: "source_ref:f5d4fb0c889ebeec"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:38"})
SET p.packetNodeId = "rg_packet:b35ad30476c8e919",
    p.titleId = "rg_turbovec:chunk:0038",
    p.title = "TurboVec raw search transcript chunk 38",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 740001-760000. Dominant lane: search.qdrant_vector. Snippets: \"message\": \"Cannot find name '$normB'.\" \"message\": \"Cannot find name 'local'.\" \"message\": \"Cannot find name '$i'.\"",
    p.summaryHash = "dc97d17159cec78170161ad7305a01100c3487c869d5909b37ef00ce48d39da5",
    p.dumpId = "rg_turbovec",
    p.packetRank = 38,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 38";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:38"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:22bb913e0772d776"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-vectors.json#L359695",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:38"}), (s:SourceRef {sourceRefId: "source_ref:22bb913e0772d776"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:3693efe22842dbfc"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-vectors.json#L359713",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:38"}), (s:SourceRef {sourceRefId: "source_ref:3693efe22842dbfc"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:0e2d63de5fe11942"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-vectors.json#L359722",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:38"}), (s:SourceRef {sourceRefId: "source_ref:0e2d63de5fe11942"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:48248e08a3511a38"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-vectors.json#L359740",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:38"}), (s:SourceRef {sourceRefId: "source_ref:48248e08a3511a38"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:2612ecab489ace71"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-vectors.json#L359749",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:38"}), (s:SourceRef {sourceRefId: "source_ref:2612ecab489ace71"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:a1d9e1013017e045"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-vectors.json#L359767",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:38"}), (s:SourceRef {sourceRefId: "source_ref:a1d9e1013017e045"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:3522f19ef867143b"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-vectors.json#L359776",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:38"}), (s:SourceRef {sourceRefId: "source_ref:3522f19ef867143b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:49c255afc798b363"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-vectors.json#L359794",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:38"}), (s:SourceRef {sourceRefId: "source_ref:49c255afc798b363"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:7f41b0db8bc5c9a9"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-vectors.json#L359803",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:38"}), (s:SourceRef {sourceRefId: "source_ref:7f41b0db8bc5c9a9"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:a5c1f6750285f2e2"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-vectors.json#L359812",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:38"}), (s:SourceRef {sourceRefId: "source_ref:a5c1f6750285f2e2"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:16501ea24b1ebe93"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-vectors.json#L359821",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:38"}), (s:SourceRef {sourceRefId: "source_ref:16501ea24b1ebe93"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:80547ca7b7c62b51"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-vectors.json#L359830",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:38"}), (s:SourceRef {sourceRefId: "source_ref:80547ca7b7c62b51"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:39"})
SET p.packetNodeId = "rg_packet:9b861205e1e552c2",
    p.titleId = "rg_turbovec:chunk:0039",
    p.title = "TurboVec raw search transcript chunk 39",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 760001-780000. Dominant lane: search.qdrant_vector. Snippets: 1769644654131 ERROR \"src\\\\lib\\\\evidence\\\\simd-gpu-tiling-engine.ts\" 10:1242 \"Cannot find name 'tiles'.\" 1769644654131 ERROR \"src\\\\lib\\\\evidence\\\\simd-gpu-tiling-engine.ts\" 10:1251 \"Cannot find name '$'. Do you need to install type definitions for jQuery? Try `npm i --save-dev @types/jquery` and then add 'jquery' to the types field in your tsconfig.\" 1769644654131 ERROR \"src\\\\lib\\\\evidence\\\\simd-gpu-tiling-engine.ts\" 10:1276 \"Cannot find name 'ms'.\"",
    p.summaryHash = "7c6648628965eea010369a0499e844081de64103acb0ad29bb14edfd26dc8863",
    p.dumpId = "rg_turbovec",
    p.packetRank = 39,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 39";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:39"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:08ec217b260a64df"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-machine.json#L19371",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:39"}), (s:SourceRef {sourceRefId: "source_ref:08ec217b260a64df"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:d3276797e6873550"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-machine.json#L19372",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:39"}), (s:SourceRef {sourceRefId: "source_ref:d3276797e6873550"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:282fe32c7bc81b67"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-machine.json#L19374",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:39"}), (s:SourceRef {sourceRefId: "source_ref:282fe32c7bc81b67"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:e6251b96495e1e40"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-machine.json#L19375",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:39"}), (s:SourceRef {sourceRefId: "source_ref:e6251b96495e1e40"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:81b4b19f1631bc5a"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-machine.json#L19376",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:39"}), (s:SourceRef {sourceRefId: "source_ref:81b4b19f1631bc5a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:ba00c53c2ebfcfba"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-machine.json#L19377",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:39"}), (s:SourceRef {sourceRefId: "source_ref:ba00c53c2ebfcfba"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:7665e6e5d7368be0"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-machine.json#L19379",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:39"}), (s:SourceRef {sourceRefId: "source_ref:7665e6e5d7368be0"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:543a8f411fbea8b3"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-machine.json#L19381",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:39"}), (s:SourceRef {sourceRefId: "source_ref:543a8f411fbea8b3"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:531f99e4bd57c336"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-machine.json#L19386",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:39"}), (s:SourceRef {sourceRefId: "source_ref:531f99e4bd57c336"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:a4749d9ff1401569"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-machine.json#L19405",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:39"}), (s:SourceRef {sourceRefId: "source_ref:a4749d9ff1401569"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b85b36c5524346b9"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-machine.json#L19406",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:39"}), (s:SourceRef {sourceRefId: "source_ref:b85b36c5524346b9"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:c3fe2b1263a1f656"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-machine.json#L19407",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:39"}), (s:SourceRef {sourceRefId: "source_ref:c3fe2b1263a1f656"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:40"})
SET p.packetNodeId = "rg_packet:6595fe5488245c07",
    p.titleId = "rg_turbovec:chunk:0040",
    p.title = "TurboVec raw search transcript chunk 40",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 780001-800000. Dominant lane: search.qdrant_vector. Snippets: export class UnifiedGPUAccelerationPipeline { webgpuAccelerator: WebGPUVectorAccelerator, tensorrtService: TensorRTAccelerationService, wasmProcessor: WebAssemblyVectorProcessor, private: config | GPUPipelineConfig; constructor(config?: Partial<GPUPipelineConfig>) { this.config = \u001b[31mError\u001b[39m: Cannot find name 'operation'. export class UnifiedGPUAccelerationPipeline { webgpuAccelerator: WebGPUVectorAccelerator, tensorrtService: TensorRTAccelerationService, wasmProcessor: WebAssemblyVectorProcessor, private: config | GPUPipelineConfig; constructor(config?: Partial<GPUPipelineConfig>) { this.config =",
    p.summaryHash = "b22580d354bf0f5ca6cde861d0fca160948b054ab2af4c804c2a4f2fad89d3c3",
    p.dumpId = "rg_turbovec",
    p.packetRank = 40,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 40";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:40"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:09255c4c9e0b79b6"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L23196",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:40"}), (s:SourceRef {sourceRefId: "source_ref:09255c4c9e0b79b6"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b1089fe885f559c7"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L23200",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:40"}), (s:SourceRef {sourceRefId: "source_ref:b1089fe885f559c7"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:ff8f10de799be019"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L23202",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:40"}), (s:SourceRef {sourceRefId: "source_ref:ff8f10de799be019"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:d1089d68fbe49127"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L23206",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:40"}), (s:SourceRef {sourceRefId: "source_ref:d1089d68fbe49127"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:205ba413a50c8dba"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L23208",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:40"}), (s:SourceRef {sourceRefId: "source_ref:205ba413a50c8dba"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f88ebdbace109785"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L23214",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:40"}), (s:SourceRef {sourceRefId: "source_ref:f88ebdbace109785"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:3c5c9c397c7b2022"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L23218",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:40"}), (s:SourceRef {sourceRefId: "source_ref:3c5c9c397c7b2022"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f3e4634908729199"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L23220",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:40"}), (s:SourceRef {sourceRefId: "source_ref:f3e4634908729199"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:c2297c7f03038948"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L23224",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:40"}), (s:SourceRef {sourceRefId: "source_ref:c2297c7f03038948"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:30ceb88062b1a4aa"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L23226",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:40"}), (s:SourceRef {sourceRefId: "source_ref:30ceb88062b1a4aa"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f27de10907df4671"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L23230",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:40"}), (s:SourceRef {sourceRefId: "source_ref:f27de10907df4671"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:522e2b6136d19559"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L23232",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:40"}), (s:SourceRef {sourceRefId: "source_ref:522e2b6136d19559"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:41"})
SET p.packetNodeId = "rg_packet:838152c9482b5aa2",
    p.titleId = "rg_turbovec:chunk:0041",
    p.title = "TurboVec raw search transcript chunk 41",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 800001-820000. Dominant lane: search.qdrant_vector. Snippets: \u001b[31mError\u001b[39m: Cannot find name 'context'. \u001b[31mError\u001b[39m: Cannot find name 'temperature'. \u001b[31mError\u001b[39m: Cannot find name 'request'.",
    p.summaryHash = "721a2f638c2fcf174a74ffe13f1731877f8bc25976b87fc4ec4c28a7fe9624ba",
    p.dumpId = "rg_turbovec",
    p.packetRank = 41,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 41";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:41"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:f16b1d312664ad97"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L235768",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:41"}), (s:SourceRef {sourceRefId: "source_ref:f16b1d312664ad97"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:7a018907a2764208"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L235780",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:41"}), (s:SourceRef {sourceRefId: "source_ref:7a018907a2764208"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:1241564831c99363"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L235792",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:41"}), (s:SourceRef {sourceRefId: "source_ref:1241564831c99363"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:7d05339359d11bd5"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L235798",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:41"}), (s:SourceRef {sourceRefId: "source_ref:7d05339359d11bd5"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:1a51445897c63b89"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L235804",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:41"}), (s:SourceRef {sourceRefId: "source_ref:1a51445897c63b89"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:6a3dc24a1a6b7c4a"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L235810",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:41"}), (s:SourceRef {sourceRefId: "source_ref:6a3dc24a1a6b7c4a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:6d11d85b42ad3b74"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L235816",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:41"}), (s:SourceRef {sourceRefId: "source_ref:6d11d85b42ad3b74"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:d2bc5262009394c5"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L235822",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:41"}), (s:SourceRef {sourceRefId: "source_ref:d2bc5262009394c5"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:78c6416cb3ce21f7"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L235828",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:41"}), (s:SourceRef {sourceRefId: "source_ref:78c6416cb3ce21f7"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:53148474659bbe00"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L235835",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:41"}), (s:SourceRef {sourceRefId: "source_ref:53148474659bbe00"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4b22b6e697bba06c"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L235841",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:41"}), (s:SourceRef {sourceRefId: "source_ref:4b22b6e697bba06c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:e01e246337e42cc2"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L235853",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:41"}), (s:SourceRef {sourceRefId: "source_ref:e01e246337e42cc2"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:42"})
SET p.packetNodeId = "rg_packet:ae8a8ea591a61b67",
    p.titleId = "rg_turbovec:chunk:0042",
    p.title = "TurboVec raw search transcript chunk 42",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 820001-840000. Dominant lane: search.qdrant_vector. Snippets: Provide a concise strategic on: 1. Most promising approach 2. Critical risk mitigation 3. Resource allocation priorities 4. Timeline considerations Keep response under, 200 words and focus on actionable insights.`;` try { const response = await fetch(`${OLLAMA_BASE_URL}/api/gener Provide a concise strategic on: 1. Most promising approach 2. Critical risk mitigation 3. Resource allocation priorities 4. Timeline considerations Keep response under, 200 words and focus on actionable insights.`;` try { const response = await fetch(`${OLLAMA_BASE_URL}/api/gener Provide a concise strategic on: 1. Most promising approach 2. Critical risk mitigation 3. Resource allocation priorities 4. Timeline considerations Keep response under, 200 words and focus on actionable insights.`;` try { const response = await fetch(`${OLLAMA_BASE_URL}/api/gener",
    p.summaryHash = "0964c9cca82c1b980fd239099e79885d35ed462eabc15da84a1d2741bf7344e8",
    p.dumpId = "rg_turbovec",
    p.packetRank = 42,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 42";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:42"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:9c835f045caa3ee7"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L464157",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:42"}), (s:SourceRef {sourceRefId: "source_ref:9c835f045caa3ee7"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:81bcbd7cf918fba7"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L464162",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:42"}), (s:SourceRef {sourceRefId: "source_ref:81bcbd7cf918fba7"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:58acc4a59bb6ba67"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L464167",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:42"}), (s:SourceRef {sourceRefId: "source_ref:58acc4a59bb6ba67"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:1d5d93ec95a52579"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L464172",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:42"}), (s:SourceRef {sourceRefId: "source_ref:1d5d93ec95a52579"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:391bd10ccd70cd00"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L464177",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:42"}), (s:SourceRef {sourceRefId: "source_ref:391bd10ccd70cd00"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:aa2ebf6ffe103819"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L464182",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:42"}), (s:SourceRef {sourceRefId: "source_ref:aa2ebf6ffe103819"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b96a8c823b00a127"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L464187",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:42"}), (s:SourceRef {sourceRefId: "source_ref:b96a8c823b00a127"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:e565ee0b8f09a708"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L464192",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:42"}), (s:SourceRef {sourceRefId: "source_ref:e565ee0b8f09a708"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:3aabc2caea12cbc5"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L464202",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:42"}), (s:SourceRef {sourceRefId: "source_ref:3aabc2caea12cbc5"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:29f324f4a179deeb"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L464214",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:42"}), (s:SourceRef {sourceRefId: "source_ref:29f324f4a179deeb"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:9394e5d387f349ac"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L464226",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:42"}), (s:SourceRef {sourceRefId: "source_ref:9394e5d387f349ac"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:0938b027fcc98342"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-errors.json#L464232",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:42"}), (s:SourceRef {sourceRefId: "source_ref:0938b027fcc98342"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:43"})
SET p.packetNodeId = "rg_packet:0afd73f3ed1dc944",
    p.titleId = "rg_turbovec:chunk:0043",
    p.title = "TurboVec raw search transcript chunk 43",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 840001-860000. Dominant lane: search.qdrant_vector. Snippets: ,Evidence: {evidence } Context: {context } , Evaluate: 1. Legal relevance 2. Admissibility considerations 3. Strength of evidence 4. Potential challenges 5. Recommendations for use` } };'` } /** * Initialize the LangChain service with custom configuration */ public async initiali ,Evidence: {evidence } Context: {context } , Evaluate: 1. Legal relevance 2. Admissibility considerations 3. Strength of evidence 4. Potential challenges 5. Recommendations for use` } };'` } /** * Initialize the LangChain service with custom configuration */ public async initiali ,Evidence: {evidence } Context: {context } , Evaluate: 1. Legal relevance 2. Admissibility considerations 3. Strength of evidence 4. Potential challenges 5. Recommendations for use` } };'` } /** * Initialize the LangChain service with custom configuration */ public async initiali",
    p.summaryHash = "c07cfb8850fe376dbe138baede7fb633184b8ffbf17675447555c21e48990c14",
    p.dumpId = "rg_turbovec",
    p.packetRank = 43,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 43";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:43"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:5f984ad0ec08bf7a"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-current.json#L200245",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:43"}), (s:SourceRef {sourceRefId: "source_ref:5f984ad0ec08bf7a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:e3eecf06f98a71bf"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-current.json#L200251",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:43"}), (s:SourceRef {sourceRefId: "source_ref:e3eecf06f98a71bf"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b0160fb0d0df91af"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-current.json#L200257",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:43"}), (s:SourceRef {sourceRefId: "source_ref:b0160fb0d0df91af"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:85fc1b1cec3ff7e4"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-current.json#L200263",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:43"}), (s:SourceRef {sourceRefId: "source_ref:85fc1b1cec3ff7e4"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:d2d6c8814f5f1918"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-current.json#L200269",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:43"}), (s:SourceRef {sourceRefId: "source_ref:d2d6c8814f5f1918"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:7c2672989010f4d3"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-current.json#L200275",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:43"}), (s:SourceRef {sourceRefId: "source_ref:7c2672989010f4d3"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:01005fdcf55cebd9"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-current.json#L200281",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:43"}), (s:SourceRef {sourceRefId: "source_ref:01005fdcf55cebd9"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:85b401072d7a61fb"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-current.json#L200287",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:43"}), (s:SourceRef {sourceRefId: "source_ref:85b401072d7a61fb"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:8f27680f25b2cc83"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-current.json#L200292",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:43"}), (s:SourceRef {sourceRefId: "source_ref:8f27680f25b2cc83"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:7c2eb947ce3db6d9"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-current.json#L200298",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:43"}), (s:SourceRef {sourceRefId: "source_ref:7c2eb947ce3db6d9"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:eda34e7b71f3fe94"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-current.json#L200304",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:43"}), (s:SourceRef {sourceRefId: "source_ref:eda34e7b71f3fe94"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:9cacf1d93a152cd7"})
SET s.sourceRef = "sveltekit-frontend/docs_readme/deeds_labs_archive/svelte-check-current.json#L200310",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:43"}), (s:SourceRef {sourceRefId: "source_ref:9cacf1d93a152cd7"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:44"})
SET p.packetNodeId = "rg_packet:8c3f4bec0966538e",
    p.titleId = "rg_turbovec:chunk:0044",
    p.title = "TurboVec raw search transcript chunk 44",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 860001-880000. Dominant lane: search.qdrant_vector. Snippets: * Performs a similarity search with the specified query and returns the * @param query The query to use for the similarity search. async similaritySearchWithScore(query, k, filter) {",
    p.summaryHash = "dd34fe4d1d9448dad0558114e8cf8af7fcade7bbade688c8e1591c3211e5f835",
    p.dumpId = "rg_turbovec",
    p.packetRank = 44,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 44";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:44"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:c1d5605b7ced40b5"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@langchain/community/dist/vectorstores/prisma.js#L162",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:44"}), (s:SourceRef {sourceRefId: "source_ref:c1d5605b7ced40b5"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f1be95f240a2b70f"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@langchain/community/dist/vectorstores/prisma.js#L164",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:44"}), (s:SourceRef {sourceRefId: "source_ref:f1be95f240a2b70f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:49282cd7e8558099"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@langchain/community/dist/vectorstores/prisma.js#L170",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:44"}), (s:SourceRef {sourceRefId: "source_ref:49282cd7e8558099"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:156fe2a0d5945ec4"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@langchain/community/dist/vectorstores/prisma.js#L171",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:44"}), (s:SourceRef {sourceRefId: "source_ref:156fe2a0d5945ec4"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:39a516ece2bbdafa"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@langchain/community/dist/vectorstores/prisma.js#L174",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:44"}), (s:SourceRef {sourceRefId: "source_ref:39a516ece2bbdafa"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:c21b8e6c55eed1f5"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@langchain/community/dist/vectorstores/prisma.js#L176",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:44"}), (s:SourceRef {sourceRefId: "source_ref:c21b8e6c55eed1f5"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:1c014d6614ff4948"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@langchain/community/dist/vectorstores/prisma.js#L181",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:44"}), (s:SourceRef {sourceRefId: "source_ref:1c014d6614ff4948"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:4dce5b4d86b66a2e"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@langchain/community/dist/vectorstores/prisma.d.ts.map#L1",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:44"}), (s:SourceRef {sourceRefId: "source_ref:4dce5b4d86b66a2e"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:1fbb68465b05821d"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@langchain/community/dist/vectorstores/prisma.d.ts#L65",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:44"}), (s:SourceRef {sourceRefId: "source_ref:1fbb68465b05821d"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:9b1c025b8c8c1628"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@langchain/community/dist/vectorstores/prisma.d.ts#L139",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:44"}), (s:SourceRef {sourceRefId: "source_ref:9b1c025b8c8c1628"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:601386a30a1582ab"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@langchain/community/dist/vectorstores/prisma.d.ts#L140",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:44"}), (s:SourceRef {sourceRefId: "source_ref:601386a30a1582ab"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:866202eb7fe98d07"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@langchain/community/dist/vectorstores/prisma.d.ts#L146",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:44"}), (s:SourceRef {sourceRefId: "source_ref:866202eb7fe98d07"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:45"})
SET p.packetNodeId = "rg_packet:3ad1c35397b297d1",
    p.titleId = "rg_turbovec:chunk:0045",
    p.title = "TurboVec raw search transcript chunk 45",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 880001-900000. Dominant lane: search.qdrant_vector. Snippets: missingAsyncHybridReturn: 'Functions that return promises must be async. Consider adding an explicit return type annotation if the function is intended to return a union of promise and non-promise types.', const annotation = checker.typeToString(type); // verify the about-to-be-added type annotation is in-scope",
    p.summaryHash = "3a56118fdb1dc5f7056d16286648ee2cf9d332ef59a272b1e7a73eae21545d4c",
    p.dumpId = "rg_turbovec",
    p.packetRank = 45,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 45";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:45"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:329d0c578b0ff07e"})
SET s.sourceRef = "sveltekit-frontend/node_modules/typescript-eslint/node_modules/@typescript-eslint/eslint-plugin/dist/rules/promise-function-async.js#L50",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:45"}), (s:SourceRef {sourceRefId: "source_ref:329d0c578b0ff07e"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:3922e8c6148920a3"})
SET s.sourceRef = "sveltekit-frontend/node_modules/typescript-eslint/node_modules/@typescript-eslint/eslint-plugin/dist/rules/prefer-readonly.js#L142",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:45"}), (s:SourceRef {sourceRefId: "source_ref:3922e8c6148920a3"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:c36439a8de1e69ed"})
SET s.sourceRef = "sveltekit-frontend/node_modules/typescript-eslint/node_modules/@typescript-eslint/eslint-plugin/dist/rules/prefer-readonly.js#L143",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:45"}), (s:SourceRef {sourceRefId: "source_ref:c36439a8de1e69ed"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:89c4c102778aa449"})
SET s.sourceRef = "sveltekit-frontend/node_modules/typescript-eslint/node_modules/@typescript-eslint/eslint-plugin/dist/rules/prefer-readonly.js#L146",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:45"}), (s:SourceRef {sourceRefId: "source_ref:89c4c102778aa449"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:0bbd01da999d556f"})
SET s.sourceRef = "sveltekit-frontend/node_modules/typescript-eslint/node_modules/@typescript-eslint/eslint-plugin/dist/rules/prefer-readonly.js#L159",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:45"}), (s:SourceRef {sourceRefId: "source_ref:0bbd01da999d556f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:31bfa5f0c4e77237"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@sveltejs/kit/src/runtime/app/server/remote/shared.js#L129",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:45"}), (s:SourceRef {sourceRefId: "source_ref:31bfa5f0c4e77237"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:5ea32a916c63a397"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@sveltejs/kit/src/runtime/app/server/remote/shared.js#L140",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:45"}), (s:SourceRef {sourceRefId: "source_ref:5ea32a916c63a397"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:7228ee762089aaa4"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@sveltejs/kit/src/runtime/app/server/remote/shared.js#L159",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:45"}), (s:SourceRef {sourceRefId: "source_ref:7228ee762089aaa4"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:81da7a0c2c492e5c"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@sveltejs/kit/src/runtime/app/server/remote/shared.js#L176",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:45"}), (s:SourceRef {sourceRefId: "source_ref:81da7a0c2c492e5c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:f6fb0722d380d69c"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@sveltejs/kit/src/runtime/app/server/remote/requested.js#L164",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:45"}), (s:SourceRef {sourceRefId: "source_ref:f6fb0722d380d69c"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:b8e16935f0970c17"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@sveltejs/kit/src/runtime/app/server/remote/query.js#L90",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:45"}), (s:SourceRef {sourceRefId: "source_ref:b8e16935f0970c17"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:abafad70a36b79f0"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@sveltejs/kit/src/runtime/app/server/remote/query.js#L194",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:45"}), (s:SourceRef {sourceRefId: "source_ref:abafad70a36b79f0"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:46"})
SET p.packetNodeId = "rg_packet:43cc537a686b1d76",
    p.titleId = "rg_turbovec:chunk:0046",
    p.title = "TurboVec raw search transcript chunk 46",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 900001-920000. Dominant lane: search.qdrant_vector. Snippets: A_rest_element_cannot_have_a_property_name: diag(2566, 1 /* Error */, \"A_rest_element_cannot_have_a_property_name_2566\", \"A rest element cannot have a property name.\"), Return_type_annotation_circularly_references_itself: diag(2577, 1 /* Error */, \"Return_type_annotation_circularly_references_itself_2577\", \"Return type annotation circularly references itself.\"), Cannot_find_name_0_Do_you_need_to_install_type_definitions_for_node_Try_npm_i_save_dev_types_Slashnode: diag(2580, 1 /* Error */, \"Cannot_find_name_0_Do_you_need_to_install_type_definitions_for_node_Try_npm_i_save_dev_types_Slashno_2580\", \"Cannot find name '{0}'. Do you need to i",
    p.summaryHash = "995613cab83affe8fed0f590376f8254eeba424579c26d8eaf217b0fa6a9875e",
    p.dumpId = "rg_turbovec",
    p.packetRank = 46,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 46";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:46"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:7575e653e9fefc4f"})
SET s.sourceRef = "sveltekit-frontend/node_modules/ts-morph/node_modules/@ts-morph/common/dist/typescript.js#L9932",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:46"}), (s:SourceRef {sourceRefId: "source_ref:7575e653e9fefc4f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:fff56618b08575d0"})
SET s.sourceRef = "sveltekit-frontend/node_modules/ts-morph/node_modules/@ts-morph/common/dist/typescript.js#L9940",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:46"}), (s:SourceRef {sourceRefId: "source_ref:fff56618b08575d0"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:df3a19401b2954ed"})
SET s.sourceRef = "sveltekit-frontend/node_modules/ts-morph/node_modules/@ts-morph/common/dist/typescript.js#L9942",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:46"}), (s:SourceRef {sourceRefId: "source_ref:df3a19401b2954ed"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:04c7039bb905ab7b"})
SET s.sourceRef = "sveltekit-frontend/node_modules/ts-morph/node_modules/@ts-morph/common/dist/typescript.js#L9943",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:46"}), (s:SourceRef {sourceRefId: "source_ref:04c7039bb905ab7b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:cf3f89188f2522cc"})
SET s.sourceRef = "sveltekit-frontend/node_modules/ts-morph/node_modules/@ts-morph/common/dist/typescript.js#L9944",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:46"}), (s:SourceRef {sourceRefId: "source_ref:cf3f89188f2522cc"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:1e72eab1539c3972"})
SET s.sourceRef = "sveltekit-frontend/node_modules/ts-morph/node_modules/@ts-morph/common/dist/typescript.js#L9945",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:46"}), (s:SourceRef {sourceRefId: "source_ref:1e72eab1539c3972"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:84380b84110c68af"})
SET s.sourceRef = "sveltekit-frontend/node_modules/ts-morph/node_modules/@ts-morph/common/dist/typescript.js#L9946",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:46"}), (s:SourceRef {sourceRefId: "source_ref:84380b84110c68af"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:9618bf2e1542822f"})
SET s.sourceRef = "sveltekit-frontend/node_modules/ts-morph/node_modules/@ts-morph/common/dist/typescript.js#L9948",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:46"}), (s:SourceRef {sourceRefId: "source_ref:9618bf2e1542822f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:84b29260e737a63a"})
SET s.sourceRef = "sveltekit-frontend/node_modules/ts-morph/node_modules/@ts-morph/common/dist/typescript.js#L9951",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:46"}), (s:SourceRef {sourceRefId: "source_ref:84b29260e737a63a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:3b71f07966eb470f"})
SET s.sourceRef = "sveltekit-frontend/node_modules/ts-morph/node_modules/@ts-morph/common/dist/typescript.js#L9952",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:46"}), (s:SourceRef {sourceRefId: "source_ref:3b71f07966eb470f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:ac37716d9c81567b"})
SET s.sourceRef = "sveltekit-frontend/node_modules/ts-morph/node_modules/@ts-morph/common/dist/typescript.js#L9953",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:46"}), (s:SourceRef {sourceRefId: "source_ref:ac37716d9c81567b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:66309aa082a26781"})
SET s.sourceRef = "sveltekit-frontend/node_modules/ts-morph/node_modules/@ts-morph/common/dist/typescript.js#L9983",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:46"}), (s:SourceRef {sourceRefId: "source_ref:66309aa082a26781"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:47"})
SET p.packetNodeId = "rg_packet:c29b52be00f977c3",
    p.titleId = "rg_turbovec:chunk:0047",
    p.title = "TurboVec raw search transcript chunk 47",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 920001-940000. Dominant lane: search.qdrant_vector. Snippets: let input_channel = in_channel_offset + wInChannel; let xVal = ${w.get(\"batch\",\"xHeight\",\"xWidth\",\"input_channel\")}; let wVal = ${v.get(\"wHeight\",\"wWidth\",\"wInChannel\",\"output_channel\")};",
    p.summaryHash = "8a196c73b101ad9f09bb2b4e9c3182e14955f5ae1c44d2f6e210dea0f2690265",
    p.dumpId = "rg_turbovec",
    p.packetRank = 47,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 47";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:47"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:a201190ea5446fa4"})
SET s.sourceRef = "sveltekit-frontend/node_modules/onnxruntime-web/dist/ort.min.mjs#L1113",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:47"}), (s:SourceRef {sourceRefId: "source_ref:a201190ea5446fa4"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:e40dccf2854c6345"})
SET s.sourceRef = "sveltekit-frontend/node_modules/onnxruntime-web/dist/ort.min.mjs#L1114",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:47"}), (s:SourceRef {sourceRefId: "source_ref:e40dccf2854c6345"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:a4737d0341716c45"})
SET s.sourceRef = "sveltekit-frontend/node_modules/onnxruntime-web/dist/ort.min.mjs#L1115",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:47"}), (s:SourceRef {sourceRefId: "source_ref:a4737d0341716c45"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:0794286039833e32"})
SET s.sourceRef = "sveltekit-frontend/node_modules/onnxruntime-web/dist/ort.min.mjs#L1121",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:47"}), (s:SourceRef {sourceRefId: "source_ref:0794286039833e32"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:06dcfd0727035350"})
SET s.sourceRef = "sveltekit-frontend/node_modules/onnxruntime-web/dist/ort.min.mjs#L1122",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:47"}), (s:SourceRef {sourceRefId: "source_ref:06dcfd0727035350"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:95c50fc36b8f7541"})
SET s.sourceRef = "sveltekit-frontend/node_modules/onnxruntime-web/dist/ort.min.mjs#L1136",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:47"}), (s:SourceRef {sourceRefId: "source_ref:95c50fc36b8f7541"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:6fc9a025e114f8e5"})
SET s.sourceRef = "sveltekit-frontend/node_modules/onnxruntime-web/dist/ort.min.mjs#L1137",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:47"}), (s:SourceRef {sourceRefId: "source_ref:6fc9a025e114f8e5"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:979e7a1e0618df8f"})
SET s.sourceRef = "sveltekit-frontend/node_modules/onnxruntime-web/dist/ort.min.mjs#L1150",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:47"}), (s:SourceRef {sourceRefId: "source_ref:979e7a1e0618df8f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:ea5c4e598d1c2340"})
SET s.sourceRef = "sveltekit-frontend/node_modules/onnxruntime-web/dist/ort.min.mjs#L1152",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:47"}), (s:SourceRef {sourceRefId: "source_ref:ea5c4e598d1c2340"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:5d144c8b6eafa14b"})
SET s.sourceRef = "sveltekit-frontend/node_modules/onnxruntime-web/dist/ort.min.mjs#L1153",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:47"}), (s:SourceRef {sourceRefId: "source_ref:5d144c8b6eafa14b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:891282244d366b6a"})
SET s.sourceRef = "sveltekit-frontend/node_modules/onnxruntime-web/dist/ort.min.mjs#L1160",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:47"}), (s:SourceRef {sourceRefId: "source_ref:891282244d366b6a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:9611b2dec6138d76"})
SET s.sourceRef = "sveltekit-frontend/node_modules/onnxruntime-web/dist/ort.min.mjs#L1165",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:47"}), (s:SourceRef {sourceRefId: "source_ref:9611b2dec6138d76"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_turbovec:48"})
SET p.packetNodeId = "rg_packet:d6ffc1d5ed455a7f",
    p.titleId = "rg_turbovec:chunk:0048",
    p.title = "TurboVec raw search transcript chunk 48",
    p.featureId = "search.qdrant_vector",
    p.sourceRef = "docs/reports/rg_turbovec.txt",
    p.summary = "TurboVec raw search transcript chunk spanning lines 940001-941087. Dominant lane: search.qdrant_vector. Snippets: loadedChannelzDefinition = channelzGrpcObject.grpc.channelz.v1.Channelz.service; return loadedChannelzDefinition;",
    p.summaryHash = "5447e39e2949fded18d5f7b898a3cc675cbda97c00158d53467b799dec6b1a15",
    p.dumpId = "rg_turbovec",
    p.packetRank = 48,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
SET f.featureId = "search.qdrant_vector",
    f.title = "TurboVec raw search transcript chunk 48";
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:48"}), (f:ParentAtlasFeature {featureKey: "search.qdrant_vector"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:0a98ef7abe8fd864"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@grpc/grpc-js/build/src/channelz.js#L591",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:48"}), (s:SourceRef {sourceRefId: "source_ref:0a98ef7abe8fd864"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:a38a865cbae6c7f3"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@grpc/grpc-js/build/src/channelz.js#L592",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:48"}), (s:SourceRef {sourceRefId: "source_ref:a38a865cbae6c7f3"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:5ef8bcee631fc27d"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@grpc/grpc-js/build/src/channelz.js#L593",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:48"}), (s:SourceRef {sourceRefId: "source_ref:5ef8bcee631fc27d"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:3cf74fb22b02d2c4"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@grpc/grpc-js/build/src/channelz.js#L596",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:48"}), (s:SourceRef {sourceRefId: "source_ref:3cf74fb22b02d2c4"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:8f4e0dfde64f81b9"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@grpc/grpc-js/build/src/channelz.js#L598",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:48"}), (s:SourceRef {sourceRefId: "source_ref:8f4e0dfde64f81b9"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:af46ddfbc428cbbc"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@grpc/grpc-js/build/src/channelz.d.ts#L3",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:48"}), (s:SourceRef {sourceRefId: "source_ref:af46ddfbc428cbbc"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:5ddd1ae79c5d206e"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@grpc/grpc-js/build/src/channelz.d.ts#L4",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:48"}), (s:SourceRef {sourceRefId: "source_ref:5ddd1ae79c5d206e"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:a9a6fcedc5f63ca3"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@grpc/grpc-js/build/src/channelz.d.ts#L5",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:48"}), (s:SourceRef {sourceRefId: "source_ref:a9a6fcedc5f63ca3"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:eaa4bbdccb0634b2"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@grpc/grpc-js/build/src/channelz.d.ts#L12",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:48"}), (s:SourceRef {sourceRefId: "source_ref:eaa4bbdccb0634b2"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:9c14c39f7298248a"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@grpc/grpc-js/build/src/channelz.d.ts#L13",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:48"}), (s:SourceRef {sourceRefId: "source_ref:9c14c39f7298248a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:a22370ba538e783f"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@grpc/grpc-js/build/src/channelz.d.ts#L15",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:48"}), (s:SourceRef {sourceRefId: "source_ref:a22370ba538e783f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:a24baf4750db7fd0"})
SET s.sourceRef = "sveltekit-frontend/node_modules/@grpc/grpc-js/build/src/channelz.d.ts#L16",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_turbovec:48"}), (s:SourceRef {sourceRefId: "source_ref:a24baf4750db7fd0"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_napi:1"})
SET p.packetNodeId = "rg_packet:c61a6729a31c98ef",
    p.titleId = "rg_napi:chunk:0001",
    p.title = "N-API bridge raw search transcript chunk 1",
    p.featureId = "gpu.simd_bridge",
    p.sourceRef = "docs/reports/rg_napi.txt",
    p.summary = "N-API bridge raw search transcript chunk spanning lines 1-20000. Dominant lane: gpu.simd_bridge. Snippets: `config.kit.csrf.checkOrigin` has been deprecated in favour of `csrf.trustedOrigins`. It will be removed in a future version Compiled addon\ttensorrt_bridge.node (230 KB)\tBuilt yesterday (2026-03-29) Bridge loader\tsimdjson-bridge.ts\tLooks for ../simd-bridge/cpp/build/Release/tensorrt_bridge.node — matches",
    p.summaryHash = "ed37bf764cfe3b8e9733ca86c49817d9d2588ad6b079b81a1a767c996ad77c0b",
    p.dumpId = "rg_napi",
    p.packetRank = 1,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "gpu.simd_bridge"})
SET f.featureId = "gpu.simd_bridge",
    f.title = "N-API bridge raw search transcript chunk 1";
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:1"}), (f:ParentAtlasFeature {featureKey: "gpu.simd_bridge"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:4ae79569bd302204"})
SET s.sourceRef = "32726.txt#L15",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:1"}), (s:SourceRef {sourceRefId: "source_ref:4ae79569bd302204"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:445dddec335df008"})
SET s.sourceRef = "330_26.txt#L83",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:1"}), (s:SourceRef {sourceRefId: "source_ref:445dddec335df008"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:3359a3dcf6d9c619"})
SET s.sourceRef = "330_26.txt#L84",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:1"}), (s:SourceRef {sourceRefId: "source_ref:3359a3dcf6d9c619"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:90825835f699b561"})
SET s.sourceRef = "330_26.txt#L85",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:1"}), (s:SourceRef {sourceRefId: "source_ref:90825835f699b561"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:85f970fa586b7db4"})
SET s.sourceRef = "330_26.txt#L88",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:1"}), (s:SourceRef {sourceRefId: "source_ref:85f970fa586b7db4"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:caae6e0bebc1cb91"})
SET s.sourceRef = "331_26.txt#L432",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:1"}), (s:SourceRef {sourceRefId: "source_ref:caae6e0bebc1cb91"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:bf0576e73769eb61"})
SET s.sourceRef = "331_26.txt#L436",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:1"}), (s:SourceRef {sourceRefId: "source_ref:bf0576e73769eb61"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:cbabcda1a513e814"})
SET s.sourceRef = "331_26.txt#L892",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:1"}), (s:SourceRef {sourceRefId: "source_ref:cbabcda1a513e814"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:143859bc14e2160d"})
SET s.sourceRef = "331_26.txt#L896",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:1"}), (s:SourceRef {sourceRefId: "source_ref:143859bc14e2160d"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:fb95e500be4ab8c6"})
SET s.sourceRef = "3_24_26.txt#L117",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:1"}), (s:SourceRef {sourceRefId: "source_ref:fb95e500be4ab8c6"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:df0f3fc291f61b5d"})
SET s.sourceRef = "4826nextsteps.txt#L28",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:1"}), (s:SourceRef {sourceRefId: "source_ref:df0f3fc291f61b5d"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:565744c8569294f1"})
SET s.sourceRef = "4826nextsteps.txt#L29",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:1"}), (s:SourceRef {sourceRefId: "source_ref:565744c8569294f1"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (p:ParentAtlasPacket {packetId: "rg_napi:2"})
SET p.packetNodeId = "rg_packet:06d669ab8cd2ea5c",
    p.titleId = "rg_napi:chunk:0002",
    p.title = "N-API bridge raw search transcript chunk 2",
    p.featureId = "gpu.simd_bridge",
    p.sourceRef = "docs/reports/rg_napi.txt",
    p.summary = "N-API bridge raw search transcript chunk spanning lines 20001-31668. Dominant lane: gpu.simd_bridge. Snippets: 1769210487883 ERROR \"src\\\\lib\\\\services\\\\node-simd-json.ts\" 4:692 \"',' expected.\" 1769210487883 ERROR \"src\\\\lib\\\\services\\\\node-simd-json.ts\" 4:702 \"';' expected.\" 1769210487883 ERROR \"src\\\\lib\\\\services\\\\node-simd-json.ts\" 4:704 \"Unexpected keyword or identifier.\"",
    p.summaryHash = "d9faf547942aeb8aa49d2b8854918f91a0df69bfd16a73478664b3a63f2cea20",
    p.dumpId = "rg_napi",
    p.packetRank = 2,
    p.joinSpine = 'sourceRef + feature_id',
    p.updatedAt = datetime();
MERGE (f:ParentAtlasFeature {featureKey: "gpu.simd_bridge"})
SET f.featureId = "gpu.simd_bridge",
    f.title = "N-API bridge raw search transcript chunk 2";
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:2"}), (f:ParentAtlasFeature {featureKey: "gpu.simd_bridge"})
MERGE (p)-[:LABELS_FEATURE]->(f);
MERGE (s:SourceRef {sourceRefId: "source_ref:a5a5ba0f35be8dd2"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-11.txt#L8418",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:2"}), (s:SourceRef {sourceRefId: "source_ref:a5a5ba0f35be8dd2"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:5523f5558b845ea9"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-11.txt#L8419",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:2"}), (s:SourceRef {sourceRefId: "source_ref:5523f5558b845ea9"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:552799483490375f"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-11.txt#L8420",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:2"}), (s:SourceRef {sourceRefId: "source_ref:552799483490375f"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:cfb5050dba7d3fe6"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-11.txt#L8421",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:2"}), (s:SourceRef {sourceRefId: "source_ref:cfb5050dba7d3fe6"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:73a602522e4d3727"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-11.txt#L8422",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:2"}), (s:SourceRef {sourceRefId: "source_ref:73a602522e4d3727"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:e236a75eef70b75a"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-11.txt#L8423",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:2"}), (s:SourceRef {sourceRefId: "source_ref:e236a75eef70b75a"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:e5935af1e51f3d2e"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-11.txt#L8424",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:2"}), (s:SourceRef {sourceRefId: "source_ref:e5935af1e51f3d2e"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:5093c89cdd857122"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-11.txt#L8425",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:2"}), (s:SourceRef {sourceRefId: "source_ref:5093c89cdd857122"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:e8034da105070618"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-11.txt#L8426",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:2"}), (s:SourceRef {sourceRefId: "source_ref:e8034da105070618"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:a41cbe4074879693"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-11.txt#L8427",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:2"}), (s:SourceRef {sourceRefId: "source_ref:a41cbe4074879693"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:ef5021350ded0a65"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-11.txt#L8428",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:2"}), (s:SourceRef {sourceRefId: "source_ref:ef5021350ded0a65"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);
MERGE (s:SourceRef {sourceRefId: "source_ref:eb22035a2434c06b"})
SET s.sourceRef = "sveltekit-frontend/svelte-errors-11.txt#L8429",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (p:ParentAtlasPacket {packetId: "rg_napi:2"}), (s:SourceRef {sourceRefId: "source_ref:eb22035a2434c06b"})
MERGE (p)-[:SUPPORTED_BY_SOURCE_REF]->(s);

