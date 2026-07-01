# Ontology / KAG Readiness

Status: WARN
Candidates: 5000
Tuples: 176237

## Metrics

| Metric | Score | Coverage | Evidence |
|---|---:|---:|---|
| lexical | 1 | 100% | symbols/trigrams available for candidate rows |
| taxonomic | 0.5009 | 50.09% | canonical feature_id plus domain_class coverage |
| semantic | 1 | 100% | TurboVec ANN gRPC proof passed over Qdrant vectors |
| context | 1 | 100% | bounded packet context refs exist on disk |
| syntactic | 0.9999 | 99.99% | packet_key/source_ref/feature_id contract fields |
| structural | 0.9574 | 95.74% | IMPORTS/EXPORTS/DEFINES/ROUTE_HANDLES tuple coverage |
| application | 0.4814 | 48.14% | KAG/ACE-ready rows with feature identity and runtime/retrieval relations |
| data_driven | 1 | 100% | tuple corpus volume relative to candidate set |
| user_based | 0 | 0% | operator acceptance/rejection signal not present in this artifact |

## Continuous Validation Vector

| Metric | Average | P10 | P50 | P90 |
|---|---:|---:|---:|---:|
| lexical | 0.9606 | 0.875 | 1 | 1 |
| taxonomic | 0.5009 | 0.5 | 0.5 | 0.5 |
| semantic | 0.0291 | 0.0136 | 0.0214 | 0.0559 |
| contextual | 0.5176 | 0.2 | 0.2 | 1 |
| syntactic | 1 | 1 | 1 | 1 |
| structural | 0.7895 | 0.4783 | 0.8667 | 1 |
| completeness | 0.9999 | 1 | 1 | 1 |
| consistency | 0.9928 | 1 | 1 | 1 |
| coupling | 0.4898 | 0.22 | 0.4 | 1 |
| modularity | 0.8276 | 0 | 0.998 | 0.998 |
| connectivity | 0.4787 | 0.25 | 0.4125 | 0.8375 |
| authority | 0.2409 | 0.1837 | 0.2373 | 0.3052 |

## Accelerator Proof

Status: PASS
Backend: bridge:py(python)+addon(cuda)
HTTP indexed: 1000
gRPC candidates: 10

## Agentic Mutation Attempts

## GAN Proof Matrix

| Category | GAN Status | Implementation | Missing | Proof command |
|---|---|---|---|---|
| lexical | PROVEN | Compare symbols, identifiers, comments, summaries, and trigrams against LangExtract/domain vocabulary. | none | `npm run atlas:ontology-kag:readiness` |
| taxonomic | WIRED | Verify IS_A, PART_OF/HAS_A, IMPLEMENTS, EXTENDS, and hierarchy edges from AST/source tuples. | domain_class coverage is low; HAS_A/IS_A projection to KAG/Neo4j not proven | `npm run atlas:ontology-kag:readiness` |
| semantic | PROVEN | Use embeddings and graph consistency to detect incompatible relationships between concepts. | summary embedding similarity; graph consistency proof | `npm run atlas:turbovec:ann-grpc:proof && npm run atlas:ontology-kag:readiness` |
| context | PROVEN | Compare concepts with neighboring modules, source_ref siblings, docs, and linked retrieval context. | neighbor module/document comparison still partial | `npm run atlas:ontology-kag:readiness` |
| syntactic | PROVEN | Validate AST integrity, schema correctness, Zod/JSON schema, protobuf/gRPC, and RPC contracts. | none | `npm run atlas:ontology-kag:readiness && npm run verify:rpc-gan` |
| structural | PROVEN | Detect orphans, duplicates, cycles, disconnected subgraphs, coupling, and missing core concepts. | Neo4j projection/PageRank/GDS not yet proven for this candidate set | `npm run atlas:source-tuples:apply && npm run atlas:ontology-kag:readiness` |
| application | WIRED | Measure whether retrieval, summarization, KAG/DAG traversal, and agent tasks improve after updates. | HyperRAG packet RPC replay proof; ACE/KAG/DAG provenance persistence; operator accepted/rejected signal | `npm run smoke:hyperrag-packet-rpc && npm run atlas:ontology-kag:readiness` |
| data_driven | PROVEN | Compare ontology coverage against the full corpus of extracted packets and tuples. | none | `npm run atlas:source-tuples:apply && npm run atlas:ontology-kag:readiness` |
| user_based | CREATED | Use operator feedback, review flags, corrected summaries, and accepted/rejected recommendations. | operator feedback capture; accepted/rejected recommendation replay reward | `npm run atlas:recommendations:replay` |

### user_based
1. Expose top weak ontology clusters to the operator board for review.
2. Store operator accepted/rejected recommendations as replay reward evidence.
3. Do not mark DONE until replay/eval confirms improvement.

### semantic
1. Embed candidate context with EmbeddingGemma 768 and compare summary_embedding similarity.
2. Run LangExtract over candidate summaries to normalize entities/actions/dependencies.
3. Ask Gemma4 for a 2-3 sentence purpose only after ranked evidence is assembled.

### authority
1. Compute PageRank/GDS authority after Neo4j projection, not before embeddings.
2. Use authority as rerank metadata rather than identity.
3. Compare authority score against replay success before boosting recommendations.

### connectivity
1. Project tuple edges into Neo4j and compute bounded PageRank later.
2. Find orphan packets with zero structural/runtime edges.
3. Add KAG traversal proof for connected packets before board promotion.

### application
1. Run HyperRAG packet RPC smoke and require packet_key/source_ref/feature_id survival.
2. Persist ACE/KAG/DAG hit provenance for accepted recommendations.
3. Create kanban task cards only from candidates with direct proof artifacts.

### coupling
1. Flag high-coupling packets for split/review instead of boosting them blindly.
2. Use coupling as a routing warning for agentic patch planning.
3. Prefer lower-coupling sibling packets when retrieval scores tie.

### taxonomic
1. Add HAS_A edges from packet -> symbols and IS_A edges from feature_id -> domain_class.
2. Reject coarse labels such as db/routes/ai as feature_id and keep them in domain_class.
3. Project feature_id/domain_class pairs into KAG nodes for traversal proof.

### contextual
1. Inspect this metric manually.

### structural
1. Project IMPORTS/DEFINES/EXPORTS/USES_* tuples into Neo4j bounded edges.
2. Detect loops, duplicate definitions, and high-tangledness packets before PageRank.
3. Use SOM 20x20 only as topology neighborhood metadata after embeddings exist.

### modularity
1. Group packets into feature modules before summary synthesis.
2. Create reusable feature envelopes for repeated symbol/dependency clusters.
3. Split over-large feature groups into subdomains before SOM training.

## SOM 20x20 Rule

Run SOM after EmbeddingGemma vectors exist. SOM/domain/topology/ontology labels remain enrichment metadata, not identity.
