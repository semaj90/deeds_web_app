export const CAPABILITIES = [
  // Authority + relational substrate
  { id:'POSTGRES_18_OWNER', group:'DATA', criticality:'UTILITY_REQUIRED', label:'PostgreSQL canonical data owner', fileHints:['drizzle','postgres','schema'], proofHints:['postgresql 18','server_version'] },
  { id:'DRIZZLE_SCHEMA_OWNER', group:'DATA', criticality:'UTILITY_REQUIRED', label:'Drizzle ORM schema ownership', fileHints:['drizzle-orm','pgTable'], proofHints:['migration','schema'] },
  { id:'PG_BTREE_IDENTITY', group:'SEARCH', criticality:'P10_CRITICAL', label:'B-tree identity/revision join indexes', fileHints:['index(','uniqueIndex('], proofHints:['btree','indexdef','packet_key','source_revision'] },
  { id:'PG_GIN_FTS', group:'SEARCH', criticality:'P10_CRITICAL', label:'PostgreSQL GIN/tsvector lexical search', fileHints:['tsvector','using gin','to_tsvector'], proofHints:['fts','gin','tsvector','readback'] },
  { id:'PGVECTOR_EXACT', group:'SEARCH', criticality:'UTILITY_REQUIRED', label:'pgvector exact semantic oracle', fileHints:['pgvector','vector('], proofHints:['exact','vector','readback'] },
  { id:'PGVECTOR_HNSW', group:'SEARCH', criticality:'CHALLENGER_OPTIONAL', label:'pgvector HNSW ANN challenger', fileHints:['using hnsw','vector_cosine_ops','vector_ip_ops'], proofHints:['hnsw','pgvector'] },

  // Canonical semantic lane
  { id:'QDRANT_COLLECTION_SCHEMA', group:'SEMANTIC', criticality:'P10_CRITICAL', label:'Qdrant semantic collection schema', fileHints:['qdrant','collection'], proofHints:['collection','semantic_768','vector'] },
  { id:'QDRANT_LINEAGE_PAYLOAD_INDEX', group:'SEMANTIC', criticality:'P10_CRITICAL', label:'Qdrant lineage payload tags/indexes', fileHints:['payload','packet_key','source_revision'], proofHints:['packet_key','symbol_version_id','workspace_revision','source_revision','readback'] },
  { id:'QDRANT_HNSW', group:'SEMANTIC', criticality:'UTILITY_REQUIRED', label:'Qdrant dense HNSW index', fileHints:['hnsw','qdrant'], proofHints:['indexed_vectors_count','hnsw'] },
  { id:'CUVS_EXACT_ORACLE', group:'SEMANTIC', criticality:'P10_CRITICAL', label:'cuVS exact/brute-force oracle', fileHints:['cuvs','brute'], proofHints:['exact','cuvs','parity'] },
  { id:'CUVS_CAGRA', group:'SEMANTIC', criticality:'CHALLENGER_OPTIONAL', label:'cuVS CAGRA GPU ANN executor', fileHints:['cagra','cuvs'], proofHints:['cagra','gpu','parity'] },

  // Ontology / directory
  { id:'OKF_SCHEMA', group:'ONTOLOGY', criticality:'UTILITY_REQUIRED', label:'.okf schema definitions', fileHints:['.okf','schema'], proofHints:['okf','schema'] },
  { id:'OKF_YAML_INSTANCES', group:'ONTOLOGY', criticality:'UTILITY_REQUIRED', label:'.okf YAML content instances', fileHints:['.okf','.yaml','.yml'], proofHints:['topic','concept','domain'] },
  { id:'TOPIC_CONCEPT_DOMAIN_TAXONOMY', group:'ONTOLOGY', criticality:'UTILITY_REQUIRED', label:'Topic/concept/domain taxonomy', fileHints:['taxonomy','topic','concept','domain'], proofHints:['taxonomy','classification'] },
  { id:'DOMAIN_CLASSIFIER', group:'ONTOLOGY', criticality:'CHALLENGER_OPTIONAL', label:'Domain classifier/tagger', fileHints:['classifier','domain'], proofHints:['classifier','backend','receipt'] },

  // File/topology plane
  { id:'DIRECTORY_FILE_GRAPH', group:'TOPOLOGY', criticality:'UTILITY_REQUIRED', label:'Directory/file relation graph', fileHints:['directory-graph','import-graph'], proofHints:['files','edges','semanticChecksum'] },
  { id:'TREE_NODE_ID_RELATIONS', group:'TOPOLOGY', criticality:'UTILITY_REQUIRED', label:'tree_node/native AST identity relations', fileHints:['treeNodeId','tree_node_id','node_id'], proofHints:['native','provenance','tree'] },
  { id:'GRAPHIFY_RELATIONS', group:'TOPOLOGY', criticality:'UTILITY_REQUIRED', label:'Graphify typed relation projection', fileHints:['graphify'], proofHints:['edges','imports','calls','references'] },
  { id:'NEO4J_PROJECTION', group:'TOPOLOGY', criticality:'CHALLENGER_OPTIONAL', label:'Neo4j topology projection', fileHints:['neo4j'], proofHints:['readback','nodes','relationships'] },
  { id:'NETWORKX_DAG', group:'TOPOLOGY', criticality:'CHALLENGER_OPTIONAL', label:'NetworkX analysis DAG helper', fileHints:['networkx'], proofHints:['dag','mutation','receipt'] },
  { id:'DAG_MUTATION_RECEIPT', group:'TOPOLOGY', criticality:'UTILITY_REQUIRED', label:'Revision-qualified DAG mutation receipt', fileHints:['dag','mutation'], proofHints:['revision','receipt','readback'] },
  { id:'KMEANS_STRUCTURAL', group:'TOPOLOGY', criticality:'CHALLENGER_OPTIONAL', label:'Structural KMeans clustering', fileHints:['kmeans','cluster-openspec'], proofHints:['cluster','challenger'] },
  { id:'SOM_20X20', group:'TOPOLOGY', criticality:'CHALLENGER_OPTIONAL', label:'20x20 SOM projection', fileHints:['som','20x20'], proofHints:['quantization','neighborhood','20'] },
  { id:'MANIFOLD_COORDINATES_5D', group:'TOPOLOGY', criticality:'CHALLENGER_OPTIONAL', label:'5D manifold/locality decomposition', fileHints:['manifold','coordinate','5d'], proofHints:['coordinate','revision','structural','semantic'] },
  { id:'FOREST_SAMPLING', group:'TOPOLOGY', criticality:'CHALLENGER_OPTIONAL', label:'Forest/tree sampling navigation', fileHints:['forest','sampling'], proofHints:['tree','sample','topology'] },

  // Cache/prefill plane
  { id:'ATLAS_ACE_RESIDENCY', group:'CACHE_PREFILL', criticality:'UTILITY_REQUIRED', label:'Parent Atlas ACE residency/control', fileHints:['ace','residency'], proofHints:['ace','policy','residency'] },
  { id:'VALKEY_CENTROID_CACHE', group:'CACHE_PREFILL', criticality:'UTILITY_REQUIRED', label:'Redis/Valkey centroid cache', fileHints:['valkey','redis','centroid'], proofHints:['centroid','readback','cache'] },
  { id:'BITFROST_BUCKET_WARMING', group:'CACHE_PREFILL', criticality:'UTILITY_REQUIRED', label:'BitFrost bucket warming', fileHints:['bitfrost','bucket','warm'], proofHints:['warm','hit','resident','readback'] },
  { id:'ACE_PACKET_V1', group:'CACHE_PREFILL', criticality:'UTILITY_REQUIRED', label:'ACE packet draft/readiness contract', fileHints:['ace-packet','packet'], proofHints:['requestId','packetKey','revisions','evidenceRefs'] },
  { id:'CONTEXT_MANIFEST_V1', group:'CACHE_PREFILL', criticality:'UTILITY_REQUIRED', label:'ContextManifest prefill boundary', fileHints:['context-manifest'], proofHints:['atlas.context-manifest.v1'] },
  { id:'LLAMA_8090_KV_AFFINITY', group:'CACHE_PREFILL', criticality:'CHALLENGER_OPTIONAL', label:'llama-server :8090 KV/prefix affinity', fileHints:['8090','cache_prompt','cache-reuse'], proofHints:['slot','prefix','cache hit'] },
  { id:'PREFILL_SYNTHESIS_READY', group:'CACHE_PREFILL', criticality:'UTILITY_REQUIRED', label:'Prefill/synthesis readiness', fileHints:['prefill','synthesis'], proofHints:['contextmanifest','checksum','model'] },

  // Protocol/control plane
  { id:'ACP_RUNTIME', group:'AGENT_CONTROL', criticality:'UTILITY_REQUIRED', label:'ACP adapter runtime proof', fileHints:['acp'], proofHints:['health','accepted','capability'] },
  { id:'A2A_RUNTIME', group:'AGENT_CONTROL', criticality:'UTILITY_REQUIRED', label:'A2A adapter runtime proof', fileHints:['a2a'], proofHints:['health','accepted','capability'] },
  { id:'HITL_RECEIPTS', group:'AGENT_CONTROL', criticality:'UTILITY_REQUIRED', label:'Human-in-the-loop decision receipts', fileHints:['human-feedback','approval'], proofHints:['decision','evidenceHash','revision'] },
  { id:'PYTORCH_SHADOW_LEARNING', group:'AGENT_CONTROL', criticality:'CHALLENGER_OPTIONAL', label:'PyTorch shadow preference/reinforcement helper', fileHints:['pytorch','torch','preference'], proofHints:['shadow_only','evaluation'] },

  // Admin/read model
  { id:'SSR_ADMIN_BOARD', group:'ADMIN', criticality:'UTILITY_REQUIRED', label:'Parent Atlas SSR admin/OpenSpec board', fileHints:['atlas/studio','+page.server','OpenSpecAwarenessPanel'], proofHints:['ssr','sse'] },
  { id:'DRIZZLE_HISTORY_READMODEL', group:'ADMIN', criticality:'UTILITY_REQUIRED', label:'Drizzle/Postgres historical board read model', fileHints:['atlas-openspec-board-schema','pgTable'], proofHints:['snapshot','checksum'] },

  // Visualization/encoding experiments: never gate P10
  { id:'NES_CHROM_GLYPH97', group:'VISUAL_EXPERIMENT', criticality:'OPTIONAL_DEFERRED', label:'NES/chrom/glyph-97 encoding/sprite experiment', fileHints:['glyph','sprite','chrom','nes'], proofHints:['glyph','sprite'] },
  { id:'LOD_MEMORY_STREAMING', group:'VISUAL_EXPERIMENT', criticality:'OPTIONAL_DEFERRED', label:'LOD memory streaming visualization', fileHints:['lod','streaming'], proofHints:['lod','resident','stream'] }
];
