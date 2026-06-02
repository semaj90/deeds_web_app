// Parent Atlas feature command atlas projection
// generatedAt: 2026-06-01T20:29:12.187Z

MERGE (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"})
SET c.title = "SourceRef Spine",
    c.description = "Parent Atlas join spine, NES chrom packets, feature_id joins, and card replay surfaces.",
    c.matchCount = 35,
    c.sourceRefAnchors = 31,
    c.semanticHash = "ed05db52e69e4d92",
    c.primarySourceRef = "local:docs/operator/atlas-production-roadmap.md#L10",
    c.updatedAt = datetime();

MERGE (f:ParentAtlasFeature {featureKey: "phase_4_admin_copilot_ui_integration"})
SET f.title = "Phase 4: Admin Copilot UI Integration",
    f.status = "missing",
    f.nextQuery = "rg \"**Provenance Display**: Show Qdrant `sourceRefs` and Neo4j graph paths in search results.\" src docs tests",
    f.semanticHash = "7c35f2193d320543";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "phase_4_admin_copilot_ui_integration"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 1, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:59865abfe9a3449f"})
SET s.sourceRef = "local:docs/operator/atlas-production-roadmap.md#L10",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "phase_4_admin_copilot_ui_integration"}), (s:SourceRef {sourceRefId: "source_ref:59865abfe9a3449f"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (s:SourceRef {sourceRefId: "source_ref:ef36e2ba908c56c0"})
SET s.sourceRef = "local:docs/operator/atlas-production-roadmap.md#L10-sha256:819d5da5790446a2",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "phase_4_admin_copilot_ui_integration"}), (s:SourceRef {sourceRefId: "source_ref:ef36e2ba908c56c0"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (s:SourceRef {sourceRefId: "source_ref:1d6bbc3a2fad7070"})
SET s.sourceRef = "local:docs/operator/atlas-production-roadmap.md#L11-sha256:8f09ab641cb51af1",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "phase_4_admin_copilot_ui_integration"}), (s:SourceRef {sourceRefId: "source_ref:1d6bbc3a2fad7070"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (s:SourceRef {sourceRefId: "source_ref:fc46bf17090b4767"})
SET s.sourceRef = "local:docs/operator/atlas-production-roadmap.md#L12-sha256:ed0a6c4fe6bbbe48",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "phase_4_admin_copilot_ui_integration"}), (s:SourceRef {sourceRefId: "source_ref:fc46bf17090b4767"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "phase_7_knowledge_base_retrieval_flow"})
SET f.title = "Phase 7: Knowledge-Base Retrieval Flow",
    f.status = "missing",
    f.nextQuery = "rg \"**Multi-Lane Retrieval**: Combine Parent Atlas (Local) + Docs Atlas (External) + Web (Unverified).\" src docs tests",
    f.semanticHash = "e0048a9cc58602c0";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "phase_7_knowledge_base_retrieval_flow"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 2, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:6b40bb9b2447cf10"})
SET s.sourceRef = "local:docs/operator/atlas-production-roadmap.md#L37",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "phase_7_knowledge_base_retrieval_flow"}), (s:SourceRef {sourceRefId: "source_ref:6b40bb9b2447cf10"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (s:SourceRef {sourceRefId: "source_ref:9ce714bb05589d1f"})
SET s.sourceRef = "local:docs/operator/atlas-production-roadmap.md#L37-sha256:3e5a348b4ecf3144",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "phase_7_knowledge_base_retrieval_flow"}), (s:SourceRef {sourceRefId: "source_ref:9ce714bb05589d1f"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (s:SourceRef {sourceRefId: "source_ref:12519d4df66ac526"})
SET s.sourceRef = "local:docs/operator/atlas-production-roadmap.md#L38-sha256:a4c270afb3a790ab",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "phase_7_knowledge_base_retrieval_flow"}), (s:SourceRef {sourceRefId: "source_ref:12519d4df66ac526"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (s:SourceRef {sourceRefId: "source_ref:6259b2b2cf386709"})
SET s.sourceRef = "local:docs/operator/atlas-production-roadmap.md#L39-sha256:6919bfcf3e4fda72",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "phase_7_knowledge_base_retrieval_flow"}), (s:SourceRef {sourceRefId: "source_ref:6259b2b2cf386709"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "system_health_benchmark_trends"})
SET f.title = "📈 System Health & Benchmark Trends",
    f.status = "implemented",
    f.nextQuery = "rg \"📈 System Health & Benchmark Trends\" src docs tests",
    f.semanticHash = "4cf94876ba072867";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "system_health_benchmark_trends"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 3, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:d8821f70faaa6c67"})
SET s.sourceRef = "local:docs/reports/workstation-observability-dashboard.md#L5",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "system_health_benchmark_trends"}), (s:SourceRef {sourceRefId: "source_ref:d8821f70faaa6c67"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "validation_diagnostics_compliance_summary"})
SET f.title = "🔬 Validation Diagnostics & Compliance Summary",
    f.status = "implemented",
    f.nextQuery = "rg \"🔬 Validation Diagnostics & Compliance Summary\" src docs tests",
    f.semanticHash = "6193a82e9232c5b1";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "validation_diagnostics_compliance_summary"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 4, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:74a82efd9e990787"})
SET s.sourceRef = "local:docs/reports/real-world-routing-eval.md#L49",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "validation_diagnostics_compliance_summary"}), (s:SourceRef {sourceRefId: "source_ref:74a82efd9e990787"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "diagnostic_explanation_of_self_learning_benefit"})
SET f.title = "🧠 Diagnostic Explanation of self-learning benefit",
    f.status = "implemented",
    f.nextQuery = "rg \"🧠 Diagnostic Explanation of self-learning benefit\" src docs tests",
    f.semanticHash = "2a44106cf9879236";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "diagnostic_explanation_of_self_learning_benefit"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 5, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:d171fb4be64bea66"})
SET s.sourceRef = "local:docs/reports/lane-routing-eval.md#L27",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "diagnostic_explanation_of_self_learning_benefit"}), (s:SourceRef {sourceRefId: "source_ref:d171fb4be64bea66"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "1_architectural_overview"})
SET f.title = "1. Architectural Overview",
    f.status = "implemented",
    f.nextQuery = "rg \"1. Architectural Overview\" src docs tests",
    f.semanticHash = "638ce923bd554e04";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "1_architectural_overview"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 6, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:37a16e5812cb87a1"})
SET s.sourceRef = "local:docs/operator/DEPLOYMENT.md#L7",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "1_architectural_overview"}), (s:SourceRef {sourceRefId: "source_ref:37a16e5812cb87a1"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "1_architectural_principles"})
SET f.title = "1. Architectural Principles",
    f.status = "implemented",
    f.nextQuery = "rg \"1. Architectural Principles\" src docs tests",
    f.semanticHash = "941798f5d4d2e292";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "1_architectural_principles"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 7, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:b28ab598f9db922b"})
SET s.sourceRef = "local:docs/architecture/vram-hygiene-policy.md#L7",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "1_architectural_principles"}), (s:SourceRef {sourceRefId: "source_ref:b28ab598f9db922b"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "1_codebase_documentation_references"})
SET f.title = "1. Codebase Documentation References",
    f.status = "implemented",
    f.nextQuery = "rg \"1. Codebase Documentation References\" src docs tests",
    f.semanticHash = "d449e5b94de523d6";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "1_codebase_documentation_references"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 8, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:49aabbe1211cfcdf"})
SET s.sourceRef = "local:docs/reports/messy-query-routing-eval.md#L5",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "1_codebase_documentation_references"}), (s:SourceRef {sourceRefId: "source_ref:49aabbe1211cfcdf"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "3_eval_15_query_routing_harness"})
SET f.title = "3. Eval: 15-query routing harness",
    f.status = "implemented",
    f.nextQuery = "rg \"3. Eval: 15-query routing harness\" src docs tests",
    f.semanticHash = "dd546ab087aba8a4";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "3_eval_15_query_routing_harness"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 9, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:a34354ee7dabdd8f"})
SET s.sourceRef = "local:docs/operator/OPERATOR_RUNBOOK.md#L187",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "3_eval_15_query_routing_harness"}), (s:SourceRef {sourceRefId: "source_ref:a34354ee7dabdd8f"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "5_hot_state_security_backups_restoration"})
SET f.title = "5. Hot State Security: Backups & Restoration",
    f.status = "implemented",
    f.nextQuery = "rg \"5. Hot State Security: Backups & Restoration\" src docs tests",
    f.semanticHash = "ff8b5d5bbe3360f6";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "5_hot_state_security_backups_restoration"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 10, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:345fc36a74fd7914"})
SET s.sourceRef = "local:docs/operator/DEPLOYMENT.md#L79",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "5_hot_state_security_backups_restoration"}), (s:SourceRef {sourceRefId: "source_ref:345fc36a74fd7914"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "5_2_hot_state_restoration"})
SET f.title = "5.2 Hot State Restoration",
    f.status = "implemented",
    f.nextQuery = "rg \"5.2 Hot State Restoration\" src docs tests",
    f.semanticHash = "39b4693d23a8cc24";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "5_2_hot_state_restoration"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 11, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:1658c3d18391f14c"})
SET s.sourceRef = "local:docs/operator/DEPLOYMENT.md#L99",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "5_2_hot_state_restoration"}), (s:SourceRef {sourceRefId: "source_ref:1658c3d18391f14c"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "benchmark_summary_metrics"})
SET f.title = "Benchmark Summary Metrics",
    f.status = "implemented",
    f.nextQuery = "rg \"Benchmark Summary Metrics\" src docs tests",
    f.semanticHash = "0e292e47d2048866";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "benchmark_summary_metrics"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 12, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:131125291bc9e388"})
SET s.sourceRef = "local:docs/reports/workstation-soak-report.md#L9",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "benchmark_summary_metrics"}), (s:SourceRef {sourceRefId: "source_ref:131125291bc9e388"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "couchdb_mapreduce_ingestion_parent_atlas_rollups"})
SET f.title = "CouchDB MapReduce Ingestion — Parent Atlas Rollups",
    f.status = "implemented",
    f.nextQuery = "rg \"CouchDB MapReduce Ingestion — Parent Atlas Rollups\" src docs tests",
    f.semanticHash = "1a7e313ab75613d9";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "couchdb_mapreduce_ingestion_parent_atlas_rollups"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 13, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:dfda28850bc1ea53"})
SET s.sourceRef = "local:docs/graph/repo-couchdb-mapreduce-report.md#L1",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "couchdb_mapreduce_ingestion_parent_atlas_rollups"}), (s:SourceRef {sourceRefId: "source_ref:dfda28850bc1ea53"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "cycle_execution_log"})
SET f.title = "Cycle Execution Log",
    f.status = "implemented",
    f.nextQuery = "rg \"Cycle Execution Log\" src docs tests",
    f.semanticHash = "63a3dc98b759988b";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "cycle_execution_log"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 14, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:763bebbc7893779b"})
SET s.sourceRef = "local:docs/reports/workstation-soak-report.md#L18",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "cycle_execution_log"}), (s:SourceRef {sourceRefId: "source_ref:763bebbc7893779b"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "deepseek_engram_architecture_search"})
SET f.title = "DeepSeek Engram Architecture Search",
    f.status = "implemented",
    f.nextQuery = "rg \"DeepSeek Engram Architecture Search\" src docs tests",
    f.semanticHash = "710e0ddd0ff5b107";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "deepseek_engram_architecture_search"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 15, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:2bae815de21d3b5b"})
SET s.sourceRef = "local:docs/architecture/deepseek-engram-architecture-search.md#L14",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "deepseek_engram_architecture_search"}), (s:SourceRef {sourceRefId: "source_ref:2bae815de21d3b5b"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "deepseek_engram_architecture_search__root"})
SET f.title = "deepseek-engram-architecture-search",
    f.status = "implemented",
    f.nextQuery = "rg \"deepseek-engram-architecture-search\" src docs tests",
    f.semanticHash = "b25acdc6dbc6a736";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "deepseek_engram_architecture_search__root"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 16, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:c980b9a80b225f0e"})
SET s.sourceRef = "local:docs/architecture/deepseek-engram-architecture-search.md#L1",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "deepseek_engram_architecture_search__root"}), (s:SourceRef {sourceRefId: "source_ref:c980b9a80b225f0e"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "engram_plugin_memory_support"})
SET f.title = "Engram Plugin Memory Support",
    f.status = "implemented",
    f.nextQuery = "rg \"Engram Plugin Memory Support\" src docs tests",
    f.semanticHash = "80f2df03c3dfcfa3";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "engram_plugin_memory_support"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 17, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:d466fc9e1ecba759"})
SET s.sourceRef = "local:docs/architecture/engram-plugin-memory-support.md#L11",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "engram_plugin_memory_support"}), (s:SourceRef {sourceRefId: "source_ref:d466fc9e1ecba759"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "engram_plugin_memory_support__root"})
SET f.title = "engram-plugin-memory-support",
    f.status = "implemented",
    f.nextQuery = "rg \"engram-plugin-memory-support\" src docs tests",
    f.semanticHash = "f3aea790b7b7aa5c";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "engram_plugin_memory_support__root"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 18, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:6481e3f3128cdacd"})
SET s.sourceRef = "local:docs/architecture/engram-plugin-memory-support.md#L1",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "engram_plugin_memory_support__root"}), (s:SourceRef {sourceRefId: "source_ref:6481e3f3128cdacd"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "investigative_plan_structure"})
SET f.title = "Investigative Plan Structure:",
    f.status = "implemented",
    f.nextQuery = "rg \"Investigative Plan Structure:\" src docs tests",
    f.semanticHash = "f244fe133e47c24c";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "investigative_plan_structure"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 19, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:28968349ca5af6bd"})
SET s.sourceRef = "local:docs/architecture/legal-ai-parent-atlas-product-integration.md#L24",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "investigative_plan_structure"}), (s:SourceRef {sourceRefId: "source_ref:28968349ca5af6bd"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "layer_3_perform_10_cycles_of_the_workstation_parent_atlas_soak_test"})
SET f.title = "Layer 3: Perform 10 cycles of the Workstation Parent Atlas soak test",
    f.status = "implemented",
    f.nextQuery = "rg \"Layer 3: Perform 10 cycles of the Workstation Parent Atlas soak test\" src docs tests",
    f.semanticHash = "ce54e6b8159324f3";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "layer_3_perform_10_cycles_of_the_workstation_parent_atlas_soak_test"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 20, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:d0f643bc73d164d8"})
SET s.sourceRef = "local:docs/operator/DEPLOYMENT.md#L155",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "layer_3_perform_10_cycles_of_the_workstation_parent_atlas_soak_test"}), (s:SourceRef {sourceRefId: "source_ref:d0f643bc73d164d8"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "legal_ai_parent_atlas_product_integration"})
SET f.title = "Legal-AI Parent Atlas Product Integration",
    f.status = "implemented",
    f.nextQuery = "rg \"Legal-AI Parent Atlas Product Integration\" src docs tests",
    f.semanticHash = "604e5c643909e770";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "legal_ai_parent_atlas_product_integration"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 21, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:6e973e347fa7151b"})
SET s.sourceRef = "local:docs/architecture/legal-ai-parent-atlas-product-integration.md#L1",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "legal_ai_parent_atlas_product_integration"}), (s:SourceRef {sourceRefId: "source_ref:6e973e347fa7151b"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "neo4j_graphrag_parent_atlas"})
SET f.title = "Neo4j GraphRAG Parent Atlas",
    f.status = "implemented",
    f.nextQuery = "rg \"Neo4j GraphRAG Parent Atlas\" src docs tests",
    f.semanticHash = "134e0113a2f220fc";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "neo4j_graphrag_parent_atlas"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 22, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:4eca99bedc38e1ea"})
SET s.sourceRef = "local:docs/architecture/neo4j-graphrag-parent-atlas.md#L11",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "neo4j_graphrag_parent_atlas"}), (s:SourceRef {sourceRefId: "source_ref:4eca99bedc38e1ea"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "neo4j_graphrag_projection_parent_atlas_ingestion"})
SET f.title = "Neo4j GraphRAG Projection — Parent Atlas Ingestion",
    f.status = "implemented",
    f.nextQuery = "rg \"Neo4j GraphRAG Projection — Parent Atlas Ingestion\" src docs tests",
    f.semanticHash = "c603c1af09203cbd";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "neo4j_graphrag_projection_parent_atlas_ingestion"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 23, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:79a7b0c43291dc24"})
SET s.sourceRef = "local:docs/graph/repo-neo4j-graphrag-report.md#L1",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "neo4j_graphrag_projection_parent_atlas_ingestion"}), (s:SourceRef {sourceRefId: "source_ref:79a7b0c43291dc24"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "neo4j_graphrag_parent_atlas__root"})
SET f.title = "neo4j-graphrag-parent-atlas",
    f.status = "implemented",
    f.nextQuery = "rg \"neo4j-graphrag-parent-atlas\" src docs tests",
    f.semanticHash = "6808ba80e404a633";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "neo4j_graphrag_parent_atlas__root"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 24, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:557a0efc09ec5c9a"})
SET s.sourceRef = "local:docs/architecture/neo4j-graphrag-parent-atlas.md#L1",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "neo4j_graphrag_parent_atlas__root"}), (s:SourceRef {sourceRefId: "source_ref:557a0efc09ec5c9a"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "opencode_mcp_atlas__root"})
SET f.title = "opencode-mcp-atlas",
    f.status = "implemented",
    f.nextQuery = "rg \"opencode-mcp-atlas\" src docs tests",
    f.semanticHash = "97d3bcac9a27c964";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:sourceRef_spine"}), (f:ParentAtlasFeature {featureKey: "opencode_mcp_atlas__root"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 25, score: 1}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:8b8256ec382657ba"})
SET s.sourceRef = "local:docs/ai-os/opencode-mcp-atlas.md#L1",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "opencode_mcp_atlas__root"}), (s:SourceRef {sourceRefId: "source_ref:8b8256ec382657ba"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"})
SET c.title = "Durable Truth",
    c.description = "Postgres 18, JSONB, pgvector, DuckDB mirrors, CouchDB envelopes, and SeaweedFS archives.",
    c.matchCount = 256,
    c.sourceRefAnchors = 33,
    c.semanticHash = "d8d519cb71bef31a",
    c.primarySourceRef = "local:docs/archive/sessions/SESSION_SUMMARY_APRIL_9_2026.md#L238",
    c.updatedAt = datetime();

MERGE (f:ParentAtlasFeature {featureKey: "2_gpu_audit_storage_postgresql_jsonb_chosen"})
SET f.title = "2. GPU Audit Storage: PostgreSQL JSONB Chosen",
    f.status = "implemented",
    f.nextQuery = "rg \"2. GPU Audit Storage: PostgreSQL JSONB Chosen\" src docs tests",
    f.semanticHash = "d4b7a05ad8d557cd";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "2_gpu_audit_storage_postgresql_jsonb_chosen"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 1, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:f00f4c36041074d2"})
SET s.sourceRef = "local:docs/archive/sessions/SESSION_SUMMARY_APRIL_9_2026.md#L238",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "2_gpu_audit_storage_postgresql_jsonb_chosen"}), (s:SourceRef {sourceRefId: "source_ref:f00f4c36041074d2"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "2_relational_vector_db_architecture"})
SET f.title = "2. Relational & Vector DB Architecture",
    f.status = "implemented",
    f.nextQuery = "rg \"2. Relational & Vector DB Architecture\" src docs tests",
    f.semanticHash = "6ded84bac80e4fa4";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "2_relational_vector_db_architecture"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 2, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:472205556ea7bb66"})
SET s.sourceRef = "local:llm/claude.md#L15",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "2_relational_vector_db_architecture"}), (s:SourceRef {sourceRefId: "source_ref:472205556ea7bb66"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "3_source_of_truth"})
SET f.title = "3. Source of truth",
    f.status = "implemented",
    f.nextQuery = "rg \"3. Source of truth\" src docs tests",
    f.semanticHash = "7c621d0d0f008020";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "3_source_of_truth"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 3, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:bf4a43b04472e4c6"})
SET s.sourceRef = "local:docs/design/subgraph-instruction-programming-kag-ace-topology-todo.md#L27",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "3_source_of_truth"}), (s:SourceRef {sourceRefId: "source_ref:bf4a43b04472e4c6"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "5_drizzle_postgres"})
SET f.title = "5. Drizzle + Postgres",
    f.status = "implemented",
    f.nextQuery = "rg \"5. Drizzle + Postgres\" src docs tests",
    f.semanticHash = "28d749e2cb70e47b";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "5_drizzle_postgres"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 4, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:beeadb234261f5d9"})
SET s.sourceRef = "local:docs/architecture/trace-kag-web-development-guide.md#L23",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "5_drizzle_postgres"}), (s:SourceRef {sourceRefId: "source_ref:beeadb234261f5d9"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "context_summary_report__root"})
SET f.title = "context_summary_report",
    f.status = "implemented",
    f.nextQuery = "rg \"context_summary_report\" src docs tests",
    f.semanticHash = "207b9d46565e5606";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "context_summary_report__root"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 5, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:21cd0cf4eebc723e"})
SET s.sourceRef = "local:docs/reports/context_summary_report.md#L1",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "context_summary_report__root"}), (s:SourceRef {sourceRefId: "source_ref:21cd0cf4eebc723e"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "core_workflows"})
SET f.title = "Core Workflows",
    f.status = "implemented",
    f.nextQuery = "rg \"Core Workflows\" src docs tests",
    f.semanticHash = "3c9c59c8474c425b";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "core_workflows"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 6, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:964c125441f41e17"})
SET s.sourceRef = "local:docs/architecture/subgraph-instruction-programming-kag-ace-topology.md#L134",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "core_workflows"}), (s:SourceRef {sourceRefId: "source_ref:964c125441f41e17"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "error_analysis_architecture__drizzle_orm"})
SET f.title = "Drizzle ORM",
    f.status = "implemented",
    f.nextQuery = "rg \"Drizzle ORM\" src docs tests",
    f.semanticHash = "81f92fa56fe3a146";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "error_analysis_architecture__drizzle_orm"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 7, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:22a68e460638e517"})
SET s.sourceRef = "local:docs/error-analysis-architecture.md#L374",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "error_analysis_architecture__drizzle_orm"}), (s:SourceRef {sourceRefId: "source_ref:22a68e460638e517"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "subgraph_instruction_programming_kag_ace_topology_todo__goal"})
SET f.title = "Goal",
    f.status = "implemented",
    f.nextQuery = "rg \"Goal\" src docs tests",
    f.semanticHash = "fb98dec9d51a0773";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "subgraph_instruction_programming_kag_ace_topology_todo__goal"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 8, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:c6fa38f8dfba343d"})
SET s.sourceRef = "local:docs/design/subgraph-instruction-programming-kag-ace-topology-todo.md#L3",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "subgraph_instruction_programming_kag_ace_topology_todo__goal"}), (s:SourceRef {sourceRefId: "source_ref:c6fa38f8dfba343d"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "jsonb_json_parsing_partial"})
SET f.title = "JSONB / JSON Parsing — Partial",
    f.status = "implemented",
    f.nextQuery = "rg \"JSONB / JSON Parsing — Partial\" src docs tests",
    f.semanticHash = "2edb6b53089be75f";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "jsonb_json_parsing_partial"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 9, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:513b3c91380e9c9f"})
SET s.sourceRef = "local:sveltekit-frontend/scripts/docs/typescript-7-release-notes.md#L251",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "jsonb_json_parsing_partial"}), (s:SourceRef {sourceRefId: "source_ref:513b3c91380e9c9f"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "missing_table_medium"})
SET f.title = "missing_table  (medium)",
    f.status = "implemented",
    f.nextQuery = "rg \"missing_table  (medium)\" src docs tests",
    f.semanticHash = "72df9076af6f7d08";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "missing_table_medium"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 10, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:2fce889f82fa1cf8"})
SET s.sourceRef = "local:docs/reports/drizzle-postgres-contract-report.md#L3353",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "missing_table_medium"}), (s:SourceRef {sourceRefId: "source_ref:2fce889f82fa1cf8"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "subgraph_instruction_programming_kag_ace_topology__overview"})
SET f.title = "Overview",
    f.status = "implemented",
    f.nextQuery = "rg \"Overview\" src docs tests",
    f.semanticHash = "7540436603911b1b";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "subgraph_instruction_programming_kag_ace_topology__overview"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 11, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:a12ff4049f530695"})
SET s.sourceRef = "local:docs/architecture/subgraph-instruction-programming-kag-ace-topology.md#L3",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "subgraph_instruction_programming_kag_ace_topology__overview"}), (s:SourceRef {sourceRefId: "source_ref:a12ff4049f530695"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "phase76_readme__root"})
SET f.title = "PHASE76_README",
    f.status = "implemented",
    f.nextQuery = "rg \"PHASE76_README\" src docs tests",
    f.semanticHash = "44fea581eb116a92";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "phase76_readme__root"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 12, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:9804971b2592fbfc"})
SET s.sourceRef = "local:scripts/PHASE76_README.md#L1",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "phase76_readme__root"}), (s:SourceRef {sourceRefId: "source_ref:9804971b2592fbfc"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "verified_stack_markers"})
SET f.title = "Verified stack markers",
    f.status = "implemented",
    f.nextQuery = "rg \"Verified stack markers\" src docs tests",
    f.semanticHash = "f9de1c0908dd9599";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "verified_stack_markers"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 13, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:110ad7cc5256fefd"})
SET s.sourceRef = "local:llm/llm_inventory.md#L16",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "verified_stack_markers"}), (s:SourceRef {sourceRefId: "source_ref:110ad7cc5256fefd"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "execution_stage_6a_h"})
SET f.title = "Execution (Stage 6A–H)",
    f.status = "partial",
    f.nextQuery = "rg \"**6B: Tier 1 Expansion**: Drizzle, Svelte 5, TypeScript, Node.js, PostgreSQL.\" src docs tests",
    f.semanticHash = "0f0896b0ecfc2c58";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "execution_stage_6a_h"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 14, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:379f0eb65cae1df3"})
SET s.sourceRef = "local:docs/operator/atlas-production-roadmap.md#L27",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "execution_stage_6a_h"}), (s:SourceRef {sourceRefId: "source_ref:379f0eb65cae1df3"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (s:SourceRef {sourceRefId: "source_ref:f5d99480f3d1a48b"})
SET s.sourceRef = "local:docs/operator/atlas-production-roadmap.md#L27-sha256:55024f03ba0d9101",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "execution_stage_6a_h"}), (s:SourceRef {sourceRefId: "source_ref:f5d99480f3d1a48b"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (s:SourceRef {sourceRefId: "source_ref:97a46b62dd4b3823"})
SET s.sourceRef = "local:docs/operator/atlas-production-roadmap.md#L28-sha256:3b25a0e4d7483f02",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "execution_stage_6a_h"}), (s:SourceRef {sourceRefId: "source_ref:97a46b62dd4b3823"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (s:SourceRef {sourceRefId: "source_ref:bb55235a3293a9d3"})
SET s.sourceRef = "local:docs/operator/atlas-production-roadmap.md#L29-sha256:e2e68ad68cd29e37",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "execution_stage_6a_h"}), (s:SourceRef {sourceRefId: "source_ref:bb55235a3293a9d3"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (s:SourceRef {sourceRefId: "source_ref:c2f861eb27ac32e5"})
SET s.sourceRef = "local:docs/operator/atlas-production-roadmap.md#L30-sha256:cfd8916957276f26",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "execution_stage_6a_h"}), (s:SourceRef {sourceRefId: "source_ref:c2f861eb27ac32e5"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (s:SourceRef {sourceRefId: "source_ref:9bfa603982ec9912"})
SET s.sourceRef = "local:docs/operator/atlas-production-roadmap.md#L31-sha256:46fb90f49698788f",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "execution_stage_6a_h"}), (s:SourceRef {sourceRefId: "source_ref:9bfa603982ec9912"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (s:SourceRef {sourceRefId: "source_ref:057bbdae4891f4f0"})
SET s.sourceRef = "local:docs/operator/atlas-production-roadmap.md#L32-sha256:7156775ade67197f",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "execution_stage_6a_h"}), (s:SourceRef {sourceRefId: "source_ref:057bbdae4891f4f0"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (s:SourceRef {sourceRefId: "source_ref:935df9af6089fa17"})
SET s.sourceRef = "local:docs/operator/atlas-production-roadmap.md#L33-sha256:383cea946b0d74f9",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "execution_stage_6a_h"}), (s:SourceRef {sourceRefId: "source_ref:935df9af6089fa17"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (s:SourceRef {sourceRefId: "source_ref:4e43b85ff3e1cc24"})
SET s.sourceRef = "local:docs/operator/atlas-production-roadmap.md#L34-sha256:94dbfdd6d927f213",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "execution_stage_6a_h"}), (s:SourceRef {sourceRefId: "source_ref:4e43b85ff3e1cc24"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "layer_1_infrastructure_continuity_deterministic_boot"})
SET f.title = "🧱 Layer 1: Infrastructure Continuity (Deterministic Boot)",
    f.status = "implemented",
    f.nextQuery = "rg \"🧱 Layer 1: Infrastructure Continuity (Deterministic Boot)\" src docs tests",
    f.semanticHash = "cf3ee4e7caf8680b";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "layer_1_infrastructure_continuity_deterministic_boot"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 15, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:40bfbce4d5ed19dd"})
SET s.sourceRef = "local:docs/operator/RESILIENCE.md#L35",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "layer_1_infrastructure_continuity_deterministic_boot"}), (s:SourceRef {sourceRefId: "source_ref:40bfbce4d5ed19dd"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "level_1_infrastructure_continuity_deterministic_boot"})
SET f.title = "🧱 Level 1 — Infrastructure Continuity (Deterministic Boot)",
    f.status = "implemented",
    f.nextQuery = "rg \"🧱 Level 1 — Infrastructure Continuity (Deterministic Boot)\" src docs tests",
    f.semanticHash = "71e8f858b7168743";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "level_1_infrastructure_continuity_deterministic_boot"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 16, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:fc2923f618a0ae4d"})
SET s.sourceRef = "local:docs/reports/resilience-continuity-recommendations.md#L33",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "level_1_infrastructure_continuity_deterministic_boot"}), (s:SourceRef {sourceRefId: "source_ref:fc2923f618a0ae4d"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "1_postgresql_port_architecture_verified"})
SET f.title = "1. PostgreSQL Port Architecture Verified",
    f.status = "implemented",
    f.nextQuery = "rg \"1. PostgreSQL Port Architecture Verified\" src docs tests",
    f.semanticHash = "009aaef06ae2348a";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "1_postgresql_port_architecture_verified"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 17, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:809e2159093c8f51"})
SET s.sourceRef = "local:docs/archive/sessions/SESSION_SUMMARY_APRIL_9_2026.md#L233",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "1_postgresql_port_architecture_verified"}), (s:SourceRef {sourceRefId: "source_ref:809e2159093c8f51"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "1_relational_parity_postgres_pgvector"})
SET f.title = "1. Relational Parity (Postgres + pgvector)",
    f.status = "implemented",
    f.nextQuery = "rg \"1. Relational Parity (Postgres + pgvector)\" src docs tests",
    f.semanticHash = "ece081d513b2964e";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "1_relational_parity_postgres_pgvector"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 18, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:64dbd96290ad9787"})
SET s.sourceRef = "local:docs/operator/RESILIENCE.md#L59",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "1_relational_parity_postgres_pgvector"}), (s:SourceRef {sourceRefId: "source_ref:64dbd96290ad9787"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "2_postgresql_17_jsonb_improvements_querying"})
SET f.title = "2. PostgreSQL 17 JSONB Improvements & Querying",
    f.status = "implemented",
    f.nextQuery = "rg \"2. PostgreSQL 17 JSONB Improvements & Querying\" src docs tests",
    f.semanticHash = "7d31712c56045da8";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "2_postgresql_17_jsonb_improvements_querying"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 19, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:b841994fc436e20e"})
SET s.sourceRef = "local:docs/llms/generated/postgres.llms-full.txt#L37",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "2_postgresql_17_jsonb_improvements_querying"}), (s:SourceRef {sourceRefId: "source_ref:b841994fc436e20e"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "3_high_performance_pgvector_hnsw_indexing"})
SET f.title = "3. High-Performance pgvector HNSW Indexing",
    f.status = "implemented",
    f.nextQuery = "rg \"3. High-Performance pgvector HNSW Indexing\" src docs tests",
    f.semanticHash = "72780fb25a74ee6d";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "3_high_performance_pgvector_hnsw_indexing"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 20, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:a57df9e5dd5c456f"})
SET s.sourceRef = "local:docs/llms/generated/postgres.llms-full.txt#L58",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "3_high_performance_pgvector_hnsw_indexing"}), (s:SourceRef {sourceRefId: "source_ref:a57df9e5dd5c456f"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "3_version_compatibility_drizzle_0_44"})
SET f.title = "3. Version Compatibility (Drizzle 0.44)",
    f.status = "implemented",
    f.nextQuery = "rg \"3. Version Compatibility (Drizzle 0.44)\" src docs tests",
    f.semanticHash = "6f4546ac905810e0";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "3_version_compatibility_drizzle_0_44"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 21, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:7d575bac5f6d3c4a"})
SET s.sourceRef = "local:docs/reports/drizzle-schema-validation-report.md#L23",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "3_version_compatibility_drizzle_0_44"}), (s:SourceRef {sourceRefId: "source_ref:7d575bac5f6d3c4a"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "4_best_practice_recommendations"})
SET f.title = "4. Best Practice Recommendations",
    f.status = "implemented",
    f.nextQuery = "rg \"4. Best Practice Recommendations\" src docs tests",
    f.semanticHash = "c4344098913e7f80";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "4_best_practice_recommendations"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 22, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:18ffa976a0a76263"})
SET s.sourceRef = "local:docs/reports/drizzle-schema-validation-report.md#L33",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "4_best_practice_recommendations"}), (s:SourceRef {sourceRefId: "source_ref:18ffa976a0a76263"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "4_check_postgresql_pgvector_works"})
SET f.title = "4. Check PostgreSQL pgvector (WORKS)",
    f.status = "implemented",
    f.nextQuery = "rg \"4. Check PostgreSQL pgvector (WORKS)\" src docs tests",
    f.semanticHash = "9fd67a7910d3c3a6";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "4_check_postgresql_pgvector_works"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 23, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:0d576be0da1f5ab9"})
SET s.sourceRef = "local:docs/archive/CRUD_OPERATIONS_AUDIT.md#L363",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "4_check_postgresql_pgvector_works"}), (s:SourceRef {sourceRefId: "source_ref:0d576be0da1f5ab9"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "5_gpu_audit_operations_new"})
SET f.title = "5. GPU Audit Operations (NEW)",
    f.status = "implemented",
    f.nextQuery = "rg \"5. GPU Audit Operations (NEW)\" src docs tests",
    f.semanticHash = "af8afeebc03e4897";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "5_gpu_audit_operations_new"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 24, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:bbc9b1354b9b7240"})
SET s.sourceRef = "local:docs/archive/CRUD_OPERATIONS_AUDIT.md#L151",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "5_gpu_audit_operations_new"}), (s:SourceRef {sourceRefId: "source_ref:bbc9b1354b9b7240"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "5_postgresql_mirroring_pgvector"})
SET f.title = "5. PostgreSQL Mirroring (pgvector)",
    f.status = "implemented",
    f.nextQuery = "rg \"5. PostgreSQL Mirroring (pgvector)\" src docs tests",
    f.semanticHash = "6efe83af6ed9090d";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:durable_truth"}), (f:ParentAtlasFeature {featureKey: "5_postgresql_mirroring_pgvector"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 25, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:f4733572f25472bf"})
SET s.sourceRef = "local:docs/KARPATHY_PIPELINE_ARCHITECTURE.md#L94",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "5_postgresql_mirroring_pgvector"}), (s:SourceRef {sourceRefId: "source_ref:f4733572f25472bf"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"})
SET c.title = "Retrieval Memory",
    c.description = "Qdrant, Redis, Bitfrost, ACE packets, multi-query tags, and semantic search caches.",
    c.matchCount = 349,
    c.sourceRefAnchors = 25,
    c.semanticHash = "e0dc524f415fa259",
    c.primarySourceRef = "local:docs/reports/turbovec-evaluation-plan.md#L8",
    c.updatedAt = datetime();

MERGE (f:ParentAtlasFeature {featureKey: "the_4_layer_retrieval_stack"})
SET f.title = "The 4-Layer Retrieval Stack:",
    f.status = "implemented",
    f.nextQuery = "rg \"The 4-Layer Retrieval Stack:\" src docs tests",
    f.semanticHash = "3d9dba4b55d376d6";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "the_4_layer_retrieval_stack"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 1, score: 5}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:404e78505bfbb62b"})
SET s.sourceRef = "local:docs/reports/turbovec-evaluation-plan.md#L8",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "the_4_layer_retrieval_stack"}), (s:SourceRef {sourceRefId: "source_ref:404e78505bfbb62b"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "1_architectural_principles"})
SET f.title = "1. Architectural Principles",
    f.status = "implemented",
    f.nextQuery = "rg \"1. Architectural Principles\" src docs tests",
    f.semanticHash = "e18ac511627ce15c";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "1_architectural_principles"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 2, score: 4}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:b28ab598f9db922b"})
SET s.sourceRef = "local:docs/architecture/vram-hygiene-policy.md#L7",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "1_architectural_principles"}), (s:SourceRef {sourceRefId: "source_ref:b28ab598f9db922b"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "critical_environment_matrix"})
SET f.title = "Critical Environment Matrix",
    f.status = "implemented",
    f.nextQuery = "rg \"Critical Environment Matrix\" src docs tests",
    f.semanticHash = "d5bec51b401b88a7";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "critical_environment_matrix"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 3, score: 4}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:c7b5fda0427bd019"})
SET s.sourceRef = "local:docs/operator/DEPLOYMENT.md#L37",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "critical_environment_matrix"}), (s:SourceRef {sourceRefId: "source_ref:c7b5fda0427bd019"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "subgraph_instruction_programming_kag_ace_topology_todo__goal"})
SET f.title = "Goal",
    f.status = "implemented",
    f.nextQuery = "rg \"Goal\" src docs tests",
    f.semanticHash = "335b2423d8784c71";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "subgraph_instruction_programming_kag_ace_topology_todo__goal"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 4, score: 4}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:c6fa38f8dfba343d"})
SET s.sourceRef = "local:docs/design/subgraph-instruction-programming-kag-ace-topology-todo.md#L3",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "subgraph_instruction_programming_kag_ace_topology_todo__goal"}), (s:SourceRef {sourceRefId: "source_ref:c6fa38f8dfba343d"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "2_storage_caching_matrix"})
SET f.title = "2. Storage & Caching Matrix",
    f.status = "implemented",
    f.nextQuery = "rg \"2. Storage & Caching Matrix\" src docs tests",
    f.semanticHash = "7abfcf4e08a85406";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "2_storage_caching_matrix"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 5, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:5dca15ecfff2830b"})
SET s.sourceRef = "local:docs/KARPATHY_PIPELINE_ARCHITECTURE.md#L33",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "2_storage_caching_matrix"}), (s:SourceRef {sourceRefId: "source_ref:5dca15ecfff2830b"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "3_poly_storage_layer_mapping"})
SET f.title = "3. Poly-Storage Layer Mapping",
    f.status = "implemented",
    f.nextQuery = "rg \"3. Poly-Storage Layer Mapping\" src docs tests",
    f.semanticHash = "2927de54e56c78c2";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "3_poly_storage_layer_mapping"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 6, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:1d1cd5319ff0e4e3"})
SET s.sourceRef = "local:docs/architecture/llm-synthesis-memory-policy.md#L35",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "3_poly_storage_layer_mapping"}), (s:SourceRef {sourceRefId: "source_ref:1d1cd5319ff0e4e3"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "3_3_redis_bitfrost_hot_cache"})
SET f.title = "3.3 Redis / BitFrost Hot Cache",
    f.status = "implemented",
    f.nextQuery = "rg \"3.3 Redis / BitFrost Hot Cache\" src docs tests",
    f.semanticHash = "b5e60b0a4b4c2895";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "3_3_redis_bitfrost_hot_cache"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 7, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:ff6482c06509d760"})
SET s.sourceRef = "local:docs/architecture/llm-synthesis-memory-policy.md#L59",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "3_3_redis_bitfrost_hot_cache"}), (s:SourceRef {sourceRefId: "source_ref:ff6482c06509d760"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "4_ace_kag_layers"})
SET f.title = "4. ACE / KAG layers",
    f.status = "implemented",
    f.nextQuery = "rg \"4. ACE / KAG layers\" src docs tests",
    f.semanticHash = "dfa3b00a4c8d0ee8";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "4_ace_kag_layers"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 8, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:d4b7015bcf017e0a"})
SET s.sourceRef = "local:docs/design/subgraph-instruction-programming-kag-ace-topology-todo.md#L32",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "4_ace_kag_layers"}), (s:SourceRef {sourceRefId: "source_ref:d4b7015bcf017e0a"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "karpathy_llmwiki__ace_kag_retrieval"})
SET f.title = "ACE / KAG / Retrieval",
    f.status = "implemented",
    f.nextQuery = "rg \"ACE / KAG / Retrieval\" src docs tests",
    f.semanticHash = "0cba691dd664bf12";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "karpathy_llmwiki__ace_kag_retrieval"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 9, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:8ca9616b4004d890"})
SET s.sourceRef = "local:llm/karpathy_llmwiki.md#L40",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "karpathy_llmwiki__ace_kag_retrieval"}), (s:SourceRef {sourceRefId: "source_ref:8ca9616b4004d890"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "core_workflows"})
SET f.title = "Core Workflows",
    f.status = "implemented",
    f.nextQuery = "rg \"Core Workflows\" src docs tests",
    f.semanticHash = "81edde9b4a5db9ad";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "core_workflows"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 10, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:964c125441f41e17"})
SET s.sourceRef = "local:docs/architecture/subgraph-instruction-programming-kag-ace-topology.md#L134",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "core_workflows"}), (s:SourceRef {sourceRefId: "source_ref:964c125441f41e17"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "data_roles"})
SET f.title = "Data Roles",
    f.status = "implemented",
    f.nextQuery = "rg \"Data Roles\" src docs tests",
    f.semanticHash = "d71051094cf93b96";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "data_roles"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 11, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:e0947312f25e523b"})
SET s.sourceRef = "local:docs/architecture/subgraph-instruction-programming-kag-ace-topology.md#L142",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "data_roles"}), (s:SourceRef {sourceRefId: "source_ref:e0947312f25e523b"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "model_server_cache_state"})
SET f.title = "Model Server & Cache State",
    f.status = "implemented",
    f.nextQuery = "rg \"Model Server & Cache State\" src docs tests",
    f.semanticHash = "3f2c23342296187a";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "model_server_cache_state"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 12, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:9189a16850cf47b1"})
SET s.sourceRef = "local:docs/reports/vram-hygiene-smoke-report.md#L15",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "model_server_cache_state"}), (s:SourceRef {sourceRefId: "source_ref:9189a16850cf47b1"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "subgraph_instruction_programming_kag_ace_topology__overview"})
SET f.title = "Overview",
    f.status = "implemented",
    f.nextQuery = "rg \"Overview\" src docs tests",
    f.semanticHash = "12ddfca5a6153139";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "subgraph_instruction_programming_kag_ace_topology__overview"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 13, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:a12ff4049f530695"})
SET s.sourceRef = "local:docs/architecture/subgraph-instruction-programming-kag-ace-topology.md#L3",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "subgraph_instruction_programming_kag_ace_topology__overview"}), (s:SourceRef {sourceRefId: "source_ref:a12ff4049f530695"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "qdrant_search_contract__root"})
SET f.title = "qdrant-search-contract",
    f.status = "implemented",
    f.nextQuery = "rg \"qdrant-search-contract\" src docs tests",
    f.semanticHash = "11514b87a3a76347";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "qdrant_search_contract__root"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 14, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:bdd783b05eeecd63"})
SET s.sourceRef = "local:docs/architecture/qdrant-search-contract.md#L1",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "qdrant_search_contract__root"}), (s:SourceRef {sourceRefId: "source_ref:bdd783b05eeecd63"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "retrieval_and_graph_layer"})
SET f.title = "Retrieval and Graph Layer",
    f.status = "implemented",
    f.nextQuery = "rg \"Retrieval and Graph Layer\" src docs tests",
    f.semanticHash = "fffe25ae1afc9e58";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "retrieval_and_graph_layer"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 15, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:4a04c391a28348dd"})
SET s.sourceRef = "local:docs/architecture/subgraph-instruction-programming-kag-ace-topology.md#L85",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "retrieval_and_graph_layer"}), (s:SourceRef {sourceRefId: "source_ref:4a04c391a28348dd"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "retrieval_order_contract"})
SET f.title = "Retrieval Order Contract",
    f.status = "implemented",
    f.nextQuery = "rg \"Retrieval Order Contract\" src docs tests",
    f.semanticHash = "3930eceb6d5ebd91";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "retrieval_order_contract"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 16, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:901d89d56f81b482"})
SET s.sourceRef = "local:docs/error-analysis-architecture.md#L281",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "retrieval_order_contract"}), (s:SourceRef {sourceRefId: "source_ref:901d89d56f81b482"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "server_surface"})
SET f.title = "Server surface",
    f.status = "implemented",
    f.nextQuery = "rg \"Server surface\" src docs tests",
    f.semanticHash = "a95a28641c38fc76";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "server_surface"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 17, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:f053cbf8a04585ff"})
SET s.sourceRef = "local:docs/codebase_atlas/feature_map.md#L11",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "server_surface"}), (s:SourceRef {sourceRefId: "source_ref:f053cbf8a04585ff"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "trace_karpathy_runtime_split"})
SET f.title = "TRACE/Karpathy Runtime Split",
    f.status = "implemented",
    f.nextQuery = "rg \"TRACE/Karpathy Runtime Split\" src docs tests",
    f.semanticHash = "77ce487c9a5c1c62";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "trace_karpathy_runtime_split"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 18, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:bc4474f7bed3a8bb"})
SET s.sourceRef = "local:docs/architecture/trace-runtime-split.md#L17",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "trace_karpathy_runtime_split"}), (s:SourceRef {sourceRefId: "source_ref:bc4474f7bed3a8bb"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "verified_stack_markers"})
SET f.title = "Verified stack markers",
    f.status = "implemented",
    f.nextQuery = "rg \"Verified stack markers\" src docs tests",
    f.semanticHash = "e3622250c388a815";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "verified_stack_markers"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 19, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:110ad7cc5256fefd"})
SET s.sourceRef = "local:llm/llm_inventory.md#L16",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "verified_stack_markers"}), (s:SourceRef {sourceRefId: "source_ref:110ad7cc5256fefd"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "where_each_technology_fits"})
SET f.title = "Where each technology fits",
    f.status = "implemented",
    f.nextQuery = "rg \"Where each technology fits\" src docs tests",
    f.semanticHash = "46b955bd010cd75f";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "where_each_technology_fits"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 20, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:9229526fb70ab650"})
SET s.sourceRef = "local:docs/reports/audit-summary-report.md#L38",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "where_each_technology_fits"}), (s:SourceRef {sourceRefId: "source_ref:9229526fb70ab650"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "resilience_continuity_recommendations__the_3_layer_continuity_matrix"})
SET f.title = "💎 The 3-Layer Continuity Matrix",
    f.status = "implemented",
    f.nextQuery = "rg \"💎 The 3-Layer Continuity Matrix\" src docs tests",
    f.semanticHash = "37db255323169ccc";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "resilience_continuity_recommendations__the_3_layer_continuity_matrix"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 21, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:681659be1992cb12"})
SET s.sourceRef = "local:docs/reports/resilience-continuity-recommendations.md#L8",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "resilience_continuity_recommendations__the_3_layer_continuity_matrix"}), (s:SourceRef {sourceRefId: "source_ref:681659be1992cb12"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "level_2_data_continuity_portable_corruption_free_state"})
SET f.title = "💾 Level 2 — Data Continuity (Portable, Corruption-Free State)",
    f.status = "implemented",
    f.nextQuery = "rg \"💾 Level 2 — Data Continuity (Portable, Corruption-Free State)\" src docs tests",
    f.semanticHash = "d485c5a4188574ff";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "level_2_data_continuity_portable_corruption_free_state"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 22, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:6f941884bf7d8e63"})
SET s.sourceRef = "local:docs/reports/resilience-continuity-recommendations.md#L41",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "level_2_data_continuity_portable_corruption_free_state"}), (s:SourceRef {sourceRefId: "source_ref:6f941884bf7d8e63"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "latency_profile_trends"})
SET f.title = "📈 Latency Profile Trends",
    f.status = "implemented",
    f.nextQuery = "rg \"📈 Latency Profile Trends\" src docs tests",
    f.semanticHash = "2ae9c0ea2db66426";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "latency_profile_trends"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 23, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:d2caf45dc79aa1fc"})
SET s.sourceRef = "local:docs/reports/turbovec-benchmark-report.md#L28",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "latency_profile_trends"}), (s:SourceRef {sourceRefId: "source_ref:d2caf45dc79aa1fc"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "1_dynamic_4d_topological_math_projection"})
SET f.title = "📐 1. Dynamic 4D Topological Math Projection",
    f.status = "implemented",
    f.nextQuery = "rg \"📐 1. Dynamic 4D Topological Math Projection\" src docs tests",
    f.semanticHash = "11669be851d5fa7b";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "1_dynamic_4d_topological_math_projection"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 24, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:855a1d3335d1d99f"})
SET s.sourceRef = "local:docs/operator/HYPERRAG_INTEGRATION.md#L30",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "1_dynamic_4d_topological_math_projection"}), (s:SourceRef {sourceRefId: "source_ref:855a1d3335d1d99f"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "architectural_insights_recall_accuracy"})
SET f.title = "🧠 Architectural Insights & Recall Accuracy",
    f.status = "implemented",
    f.nextQuery = "rg \"🧠 Architectural Insights & Recall Accuracy\" src docs tests",
    f.semanticHash = "69efe180411063e5";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:retrieval_memory"}), (f:ParentAtlasFeature {featureKey: "architectural_insights_recall_accuracy"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 25, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:86c63fa880c4d783"})
SET s.sourceRef = "local:docs/reports/turbovec-benchmark-report.md#L43",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "architectural_insights_recall_accuracy"}), (s:SourceRef {sourceRefId: "source_ref:86c63fa880c4d783"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"})
SET c.title = "Graph Topology",
    c.description = "Neo4j hypergraph merges, SOM topology, cluster joins, and graph path proofs.",
    c.matchCount = 272,
    c.sourceRefAnchors = 28,
    c.semanticHash = "bcd19f063abd8c5b",
    c.primarySourceRef = "local:docs/CODEBASE_INDEXING_PIPELINE.md#L79",
    c.updatedAt = datetime();

MERGE (f:ParentAtlasFeature {featureKey: "from_sveltekit_frontend"})
SET f.title = "From sveltekit-frontend/",
    f.status = "implemented",
    f.nextQuery = "rg \"From sveltekit-frontend/\" src docs tests",
    f.semanticHash = "2cb6ffef902e83d3";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "from_sveltekit_frontend"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 1, score: 5}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:a6b10215f35fb253"})
SET s.sourceRef = "local:docs/CODEBASE_INDEXING_PIPELINE.md#L79",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "from_sveltekit_frontend"}), (s:SourceRef {sourceRefId: "source_ref:a6b10215f35fb253"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "downstream_consumers"})
SET f.title = "Downstream Consumers",
    f.status = "implemented",
    f.nextQuery = "rg \"Downstream Consumers\" src docs tests",
    f.semanticHash = "3b52b5c58c76048d";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "downstream_consumers"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 2, score: 4}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:0daac49ca3b18d2d"})
SET s.sourceRef = "local:docs/CODEBASE_INDEXING_PIPELINE.md#L206",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "downstream_consumers"}), (s:SourceRef {sourceRefId: "source_ref:0daac49ca3b18d2d"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "karpathy_wiki_pipeline"})
SET f.title = "Karpathy Wiki Pipeline",
    f.status = "implemented",
    f.nextQuery = "rg \"Karpathy Wiki Pipeline\" src docs tests",
    f.semanticHash = "307682d98f83f06b";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "karpathy_wiki_pipeline"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 3, score: 4}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:cb164625f4c19ca5"})
SET s.sourceRef = "local:sveltekit-frontend/scripts/docs/startup-guide.md#L118",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "karpathy_wiki_pipeline"}), (s:SourceRef {sourceRefId: "source_ref:cb164625f4c19ca5"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "16_topological_path_mapping_manifold_synthesis"})
SET f.title = "16. Topological Path Mapping & Manifold Synthesis",
    f.status = "implemented",
    f.nextQuery = "rg \"16. Topological Path Mapping & Manifold Synthesis\" src docs tests",
    f.semanticHash = "a170bc4c39de3d8a";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "16_topological_path_mapping_manifold_synthesis"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 4, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:6a967de084188ea8"})
SET s.sourceRef = "local:docs/architecture/trace-kag-web-development-guide.md#L73",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "16_topological_path_mapping_manifold_synthesis"}), (s:SourceRef {sourceRefId: "source_ref:6a967de084188ea8"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "3_topological_structural_integrity_neo4j_apoc"})
SET f.title = "3. Topological Structural Integrity (Neo4j APOC)",
    f.status = "implemented",
    f.nextQuery = "rg \"3. Topological Structural Integrity (Neo4j APOC)\" src docs tests",
    f.semanticHash = "a729c84e64499812";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "3_topological_structural_integrity_neo4j_apoc"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 5, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:f4ab3fdc873139b2"})
SET s.sourceRef = "local:docs/operator/RESILIENCE.md#L66",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "3_topological_structural_integrity_neo4j_apoc"}), (s:SourceRef {sourceRefId: "source_ref:f4ab3fdc873139b2"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "4_codeintel_hypergraph"})
SET f.title = "4. CodeIntel & Hypergraph",
    f.status = "implemented",
    f.nextQuery = "rg \"4. CodeIntel & Hypergraph\" src docs tests",
    f.semanticHash = "38ce7ffcb09d7bf3";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "4_codeintel_hypergraph"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 6, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:fcb0469c2fa10220"})
SET s.sourceRef = "local:docs/devtools_rg.md#L64",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "4_codeintel_hypergraph"}), (s:SourceRef {sourceRefId: "source_ref:fcb0469c2fa10220"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "mcp_tool_surface"})
SET f.title = "MCP Tool Surface",
    f.status = "implemented",
    f.nextQuery = "rg \"MCP Tool Surface\" src docs tests",
    f.semanticHash = "6e40c94c88d4f29e";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "mcp_tool_surface"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 7, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:ff6e488953c7f55e"})
SET s.sourceRef = "local:docs/research/deep-research-topics.md#L152",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "mcp_tool_surface"}), (s:SourceRef {sourceRefId: "source_ref:ff6e488953c7f55e"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "llms__tier_f_contextual_graph_pytorch_graph"})
SET f.title = "Tier F — Contextual Graph (pytorch-graph)",
    f.status = "implemented",
    f.nextQuery = "rg \"Tier F — Contextual Graph (pytorch-graph)\" src docs tests",
    f.semanticHash = "d8962867a6d2ec66";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "llms__tier_f_contextual_graph_pytorch_graph"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 8, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:7dbd818afb8c60fc"})
SET s.sourceRef = "local:sveltekit-frontend/src/lib/server/vector/LLMS.md#L134",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "llms__tier_f_contextual_graph_pytorch_graph"}), (s:SourceRef {sourceRefId: "source_ref:7dbd818afb8c60fc"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "phase_3_post_synthesis_quality_review_runid_stage_2c_500"})
SET f.title = "Phase 3: Post-Synthesis Quality Review (RunID: `stage-2c-500`)",
    f.status = "missing",
    f.nextQuery = "rg \"**Authority Audit**: Verify PageRank scores in Neo4j align with perceived file importance.\" src docs tests",
    f.semanticHash = "7b8d138dca1a1765";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "phase_3_post_synthesis_quality_review_runid_stage_2c_500"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 9, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:779d40f83190b929"})
SET s.sourceRef = "local:docs/operator/atlas-production-roadmap.md#L5",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "phase_3_post_synthesis_quality_review_runid_stage_2c_500"}), (s:SourceRef {sourceRefId: "source_ref:779d40f83190b929"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (s:SourceRef {sourceRefId: "source_ref:95c6a6bd293ee2a2"})
SET s.sourceRef = "local:docs/operator/atlas-production-roadmap.md#L5-sha256:eb88379315a29cb0",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "phase_3_post_synthesis_quality_review_runid_stage_2c_500"}), (s:SourceRef {sourceRefId: "source_ref:95c6a6bd293ee2a2"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (s:SourceRef {sourceRefId: "source_ref:e69f3db6794b3bbc"})
SET s.sourceRef = "local:docs/operator/atlas-production-roadmap.md#L6-sha256:90cd5162e3fdeeec",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "phase_3_post_synthesis_quality_review_runid_stage_2c_500"}), (s:SourceRef {sourceRefId: "source_ref:e69f3db6794b3bbc"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (s:SourceRef {sourceRefId: "source_ref:f3508bf61cdbb773"})
SET s.sourceRef = "local:docs/operator/atlas-production-roadmap.md#L7-sha256:b115434892c11605",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "phase_3_post_synthesis_quality_review_runid_stage_2c_500"}), (s:SourceRef {sourceRefId: "source_ref:f3508bf61cdbb773"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "algorithmic_paradigm"})
SET f.title = "🧠 Algorithmic Paradigm",
    f.status = "implemented",
    f.nextQuery = "rg \"🧠 Algorithmic Paradigm\" src docs tests",
    f.semanticHash = "71c9f9b54ac1057b";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "algorithmic_paradigm"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 10, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:36494a7853546588"})
SET s.sourceRef = "local:docs/reports/autoencoder-som-map.md#L224",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "algorithmic_paradigm"}), (s:SourceRef {sourceRefId: "source_ref:36494a7853546588"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "1_codebase_documentation_references"})
SET f.title = "1. Codebase Documentation References",
    f.status = "implemented",
    f.nextQuery = "rg \"1. Codebase Documentation References\" src docs tests",
    f.semanticHash = "f93106ab7a807f5f";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "1_codebase_documentation_references"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 11, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:49aabbe1211cfcdf"})
SET s.sourceRef = "local:docs/reports/messy-query-routing-eval.md#L5",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "1_codebase_documentation_references"}), (s:SourceRef {sourceRefId: "source_ref:49aabbe1211cfcdf"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "1_vector_dimension_policy_projections"})
SET f.title = "1. Vector Dimension Policy & Projections",
    f.status = "implemented",
    f.nextQuery = "rg \"1. Vector Dimension Policy & Projections\" src docs tests",
    f.semanticHash = "8ee624cae4350788";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "1_vector_dimension_policy_projections"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 12, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:07d7c2df037d9413"})
SET s.sourceRef = "local:llm/memory.md#L7",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "1_vector_dimension_policy_projections"}), (s:SourceRef {sourceRefId: "source_ref:07d7c2df037d9413"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "3_concurrency_governance_thread_locks"})
SET f.title = "3. Concurrency Governance & Thread Locks",
    f.status = "implemented",
    f.nextQuery = "rg \"3. Concurrency Governance & Thread Locks\" src docs tests",
    f.semanticHash = "cab8ffc73c342fe3";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "3_concurrency_governance_thread_locks"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 13, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:fcd32c71752fe1d3"})
SET s.sourceRef = "local:docs/architecture/vram-hygiene-policy.md#L31",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "3_concurrency_governance_thread_locks"}), (s:SourceRef {sourceRefId: "source_ref:fcd32c71752fe1d3"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "3_source_of_truth"})
SET f.title = "3. Source of truth",
    f.status = "implemented",
    f.nextQuery = "rg \"3. Source of truth\" src docs tests",
    f.semanticHash = "4667085ea10c17b0";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "3_source_of_truth"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 14, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:bf4a43b04472e4c6"})
SET s.sourceRef = "local:docs/design/subgraph-instruction-programming-kag-ace-topology-todo.md#L27",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "3_source_of_truth"}), (s:SourceRef {sourceRefId: "source_ref:bf4a43b04472e4c6"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "3c_graph_som_topology_analysis"})
SET f.title = "3C — Graph & SOM Topology Analysis",
    f.status = "implemented",
    f.nextQuery = "rg \"3C — Graph & SOM Topology Analysis\" src docs tests",
    f.semanticHash = "3ec5f7810c3c0e35";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "3c_graph_som_topology_analysis"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 15, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:955ae4e7b95b9fc4"})
SET s.sourceRef = "local:scripts/tests/logs/langgraph-2026-04-19T08-30-34.md#L25",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "3c_graph_som_topology_analysis"}), (s:SourceRef {sourceRefId: "source_ref:955ae4e7b95b9fc4"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "4_ace_kag_layers"})
SET f.title = "4. ACE / KAG layers",
    f.status = "implemented",
    f.nextQuery = "rg \"4. ACE / KAG layers\" src docs tests",
    f.semanticHash = "5098a778e499b0a5";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "4_ace_kag_layers"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 16, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:d4b7015bcf017e0a"})
SET s.sourceRef = "local:docs/design/subgraph-instruction-programming-kag-ace-topology-todo.md#L32",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "4_ace_kag_layers"}), (s:SourceRef {sourceRefId: "source_ref:d4b7015bcf017e0a"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "6_ace_scoring_spine_context_assembly_weights"})
SET f.title = "6. ACE Scoring Spine (Context Assembly Weights)",
    f.status = "implemented",
    f.nextQuery = "rg \"6. ACE Scoring Spine (Context Assembly Weights)\" src docs tests",
    f.semanticHash = "149d291ea3cfbb54";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "6_ace_scoring_spine_context_assembly_weights"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 17, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:d9d7f5e3dcf0e95e"})
SET s.sourceRef = "local:sveltekit-frontend/scripts/docs/compiler-stack-explainer.md#L209",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "6_ace_scoring_spine_context_assembly_weights"}), (s:SourceRef {sourceRefId: "source_ref:d9d7f5e3dcf0e95e"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "active_features_stability_gates"})
SET f.title = "Active Features & Stability Gates",
    f.status = "implemented",
    f.nextQuery = "rg \"Active Features & Stability Gates\" src docs tests",
    f.semanticHash = "0b00f976f27569e2";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "active_features_stability_gates"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 18, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:45ed4e83a82d885d"})
SET s.sourceRef = "local:docs/status/feature-tracking-roadmap.md#L6",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "active_features_stability_gates"}), (s:SourceRef {sourceRefId: "source_ref:45ed4e83a82d885d"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "admin_visualization"})
SET f.title = "Admin Visualization",
    f.status = "implemented",
    f.nextQuery = "rg \"Admin Visualization\" src docs tests",
    f.semanticHash = "eb9bff787d3c7873";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "admin_visualization"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 19, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:3bbd9cb04244ca94"})
SET s.sourceRef = "local:docs/CODEBASE_INDEXING_PIPELINE.md#L256",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "admin_visualization"}), (s:SourceRef {sourceRefId: "source_ref:3bbd9cb04244ca94"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "atlas_indexing"})
SET f.title = "Atlas / Indexing",
    f.status = "implemented",
    f.nextQuery = "rg \"Atlas / Indexing\" src docs tests",
    f.semanticHash = "0319716b82f24524";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "atlas_indexing"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 20, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:e73228b1367d1700"})
SET s.sourceRef = "local:docs/codebase_atlas/top_scripts.md#L5",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "atlas_indexing"}), (s:SourceRef {sourceRefId: "source_ref:e73228b1367d1700"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "karpathy_llmwiki__atlas_indexing"})
SET f.title = "Atlas / Indexing",
    f.status = "implemented",
    f.nextQuery = "rg \"Atlas / Indexing\" src docs tests",
    f.semanticHash = "70e29bcd2702db8e";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "karpathy_llmwiki__atlas_indexing"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 21, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:8d1c4691e8b1c769"})
SET s.sourceRef = "local:llm/karpathy_llmwiki.md#L18",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "karpathy_llmwiki__atlas_indexing"}), (s:SourceRef {sourceRefId: "source_ref:8d1c4691e8b1c769"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "audit_gates_graph_analytics_som_pagerank"})
SET f.title = "Audit Gates — Graph Analytics (SOM / PageRank)",
    f.status = "implemented",
    f.nextQuery = "rg \"Audit Gates — Graph Analytics (SOM / PageRank)\" src docs tests",
    f.semanticHash = "36d8d9823605b41f";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "audit_gates_graph_analytics_som_pagerank"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 22, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:49aaae9fdc55c099"})
SET s.sourceRef = "local:sveltekit-frontend/src/lib/server/graph/LLMS.md#L336",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "audit_gates_graph_analytics_som_pagerank"}), (s:SourceRef {sourceRefId: "source_ref:49aaae9fdc55c099"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "core_workflows"})
SET f.title = "Core Workflows",
    f.status = "implemented",
    f.nextQuery = "rg \"Core Workflows\" src docs tests",
    f.semanticHash = "cc5402cfcf50a426";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "core_workflows"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 23, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:964c125441f41e17"})
SET s.sourceRef = "local:docs/architecture/subgraph-instruction-programming-kag-ace-topology.md#L134",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "core_workflows"}), (s:SourceRef {sourceRefId: "source_ref:964c125441f41e17"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "data_roles"})
SET f.title = "Data Roles",
    f.status = "implemented",
    f.nextQuery = "rg \"Data Roles\" src docs tests",
    f.semanticHash = "a54edb681406928b";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "data_roles"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 24, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:e0947312f25e523b"})
SET s.sourceRef = "local:docs/architecture/subgraph-instruction-programming-kag-ace-topology.md#L142",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "data_roles"}), (s:SourceRef {sourceRefId: "source_ref:e0947312f25e523b"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "existing_edges_used"})
SET f.title = "Existing edges used",
    f.status = "implemented",
    f.nextQuery = "rg \"Existing edges used\" src docs tests",
    f.semanticHash = "a438176eed5edda2";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:graph_topology"}), (f:ParentAtlasFeature {featureKey: "existing_edges_used"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 25, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:bc0c914e035a34a3"})
SET s.sourceRef = "local:docs/architecture/storage-tier-schema.md#L152",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "existing_edges_used"}), (s:SourceRef {sourceRefId: "source_ref:bc0c914e035a34a3"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"})
SET c.title = "Compute Ranking",
    c.description = "PyTorch, LibTorch, XGBoost, CUDA, reranking, clustering, and feature extraction lanes.",
    c.matchCount = 219,
    c.sourceRefAnchors = 25,
    c.semanticHash = "9006083067b0bdf9",
    c.primarySourceRef = "local:docs/reports/audit-summary-report.md#L151",
    c.updatedAt = datetime();

MERGE (f:ParentAtlasFeature {featureKey: "integration_features_to_look_for"})
SET f.title = "Integration features to look for",
    f.status = "implemented",
    f.nextQuery = "rg \"Integration features to look for\" src docs tests",
    f.semanticHash = "aeef832b7fcc8de3";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "integration_features_to_look_for"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 1, score: 4}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:2678f8e6ea276f11"})
SET s.sourceRef = "local:docs/reports/audit-summary-report.md#L151",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "integration_features_to_look_for"}), (s:SourceRef {sourceRefId: "source_ref:2678f8e6ea276f11"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "12_gpu_rules"})
SET f.title = "12. GPU Rules",
    f.status = "implemented",
    f.nextQuery = "rg \"12. GPU Rules\" src docs tests",
    f.semanticHash = "a26c025e023d8cba";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "12_gpu_rules"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 2, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:d46c147a94722672"})
SET s.sourceRef = "local:docs/architecture/trace-kag-web-development-guide.md#L57",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "12_gpu_rules"}), (s:SourceRef {sourceRefId: "source_ref:d46c147a94722672"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "phase_12_security_recommendations"})
SET f.title = "Phase 12 Security Recommendations",
    f.status = "implemented",
    f.nextQuery = "rg \"Phase 12 Security Recommendations\" src docs tests",
    f.semanticHash = "e738f6e836a3c4b6";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "phase_12_security_recommendations"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 3, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:e9d7a2b583b6dc79"})
SET s.sourceRef = "local:docs/reports/simd-bridge-memory-audit.md#L454",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "phase_12_security_recommendations"}), (s:SourceRef {sourceRefId: "source_ref:e9d7a2b583b6dc79"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "the_three_compiler_concepts"})
SET f.title = "The Three Compiler Concepts",
    f.status = "implemented",
    f.nextQuery = "rg \"The Three Compiler Concepts\" src docs tests",
    f.semanticHash = "e0695806d16dcc24";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "the_three_compiler_concepts"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 4, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:2933281087332236"})
SET s.sourceRef = "local:sveltekit-frontend/scripts/docs/compiler-stack-explainer.md#L8",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "the_three_compiler_concepts"}), (s:SourceRef {sourceRefId: "source_ref:2933281087332236"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "your_libtorch_n_api_bridge"})
SET f.title = "Your LibTorch N-API Bridge",
    f.status = "implemented",
    f.nextQuery = "rg \"Your LibTorch N-API Bridge\" src docs tests",
    f.semanticHash = "2ea87547567726de";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "your_libtorch_n_api_bridge"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 5, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:49b44284386cc9d3"})
SET s.sourceRef = "local:sveltekit-frontend/scripts/docs/compiler-stack-explainer.md#L68",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "your_libtorch_n_api_bridge"}), (s:SourceRef {sourceRefId: "source_ref:49b44284386cc9d3"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "2_pytorch_libtorch_tensor_compiler_stack"})
SET f.title = "2. PyTorch / LibTorch (Tensor Compiler Stack)",
    f.status = "implemented",
    f.nextQuery = "rg \"2. PyTorch / LibTorch (Tensor Compiler Stack)\" src docs tests",
    f.semanticHash = "b790fae07a8661aa";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "2_pytorch_libtorch_tensor_compiler_stack"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 6, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:a9396cfbec1b3085"})
SET s.sourceRef = "local:sveltekit-frontend/scripts/docs/compiler-stack-explainer.md#L55",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "2_pytorch_libtorch_tensor_compiler_stack"}), (s:SourceRef {sourceRefId: "source_ref:a9396cfbec1b3085"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "3_concurrency_governance_thread_locks"})
SET f.title = "3. Concurrency Governance & Thread Locks",
    f.status = "implemented",
    f.nextQuery = "rg \"3. Concurrency Governance & Thread Locks\" src docs tests",
    f.semanticHash = "b3b0b9e6e12da85d";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "3_concurrency_governance_thread_locks"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 7, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:fcd32c71752fe1d3"})
SET s.sourceRef = "local:docs/architecture/vram-hygiene-policy.md#L31",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "3_concurrency_governance_thread_locks"}), (s:SourceRef {sourceRefId: "source_ref:fcd32c71752fe1d3"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "4_libtorch_boundaries"})
SET f.title = "4. LibTorch Boundaries",
    f.status = "implemented",
    f.nextQuery = "rg \"4. LibTorch Boundaries\" src docs tests",
    f.semanticHash = "b6c775a22032db48";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "4_libtorch_boundaries"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 8, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:ff86e08a724ba22d"})
SET s.sourceRef = "local:docs/architecture/llm-synthesis-memory-policy.md#L78",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "4_libtorch_boundaries"}), (s:SourceRef {sourceRefId: "source_ref:ff86e08a724ba22d"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "5_multi_lora_sequential_vram_safety_gate"})
SET f.title = "5. Multi-LoRA Sequential VRAM Safety Gate",
    f.status = "implemented",
    f.nextQuery = "rg \"5. Multi-LoRA Sequential VRAM Safety Gate\" src docs tests",
    f.semanticHash = "9859eaa7b3c63509";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "5_multi_lora_sequential_vram_safety_gate"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 9, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:10cb0055b8daf69d"})
SET s.sourceRef = "local:docs/operator/OPERATOR_RUNBOOK.md#L165",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "5_multi_lora_sequential_vram_safety_gate"}), (s:SourceRef {sourceRefId: "source_ref:10cb0055b8daf69d"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "classification_matrix"})
SET f.title = "Classification Matrix",
    f.status = "implemented",
    f.nextQuery = "rg \"Classification Matrix\" src docs tests",
    f.semanticHash = "72c22c80182b5427";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "classification_matrix"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 10, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:5ede453e12ab6b90"})
SET s.sourceRef = "local:docs/reports/simd-bridge-memory-audit.md#L14",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "classification_matrix"}), (s:SourceRef {sourceRefId: "source_ref:5ede453e12ab6b90"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "coordinate_cell_0_0_2_chunks"})
SET f.title = "Coordinate Cell `(0, 0)` — (2 Chunks)",
    f.status = "implemented",
    f.nextQuery = "rg \"Coordinate Cell `(0, 0)` — (2 Chunks)\" src docs tests",
    f.semanticHash = "e63cdc6edd801d4f";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "coordinate_cell_0_0_2_chunks"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 11, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:a1d1090e63fc6442"})
SET s.sourceRef = "local:docs/reports/autoencoder-som-map.md#L36",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "coordinate_cell_0_0_2_chunks"}), (s:SourceRef {sourceRefId: "source_ref:a1d1090e63fc6442"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "coordinate_cell_5_2_1_chunks"})
SET f.title = "Coordinate Cell `(5, 2)` — (1 Chunks)",
    f.status = "implemented",
    f.nextQuery = "rg \"Coordinate Cell `(5, 2)` — (1 Chunks)\" src docs tests",
    f.semanticHash = "3c581cff37ebcfb5";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "coordinate_cell_5_2_1_chunks"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 12, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:d0b9b8ef19ccf232"})
SET s.sourceRef = "local:docs/reports/autoencoder-som-map.md#L112",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "coordinate_cell_5_2_1_chunks"}), (s:SourceRef {sourceRefId: "source_ref:d0b9b8ef19ccf232"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "coordinate_cell_7_0_4_chunks"})
SET f.title = "Coordinate Cell `(7, 0)` — (4 Chunks)",
    f.status = "implemented",
    f.nextQuery = "rg \"Coordinate Cell `(7, 0)` — (4 Chunks)\" src docs tests",
    f.semanticHash = "1f76959f69c825ca";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "coordinate_cell_7_0_4_chunks"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 13, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:193405a5e8ff4249"})
SET s.sourceRef = "local:docs/reports/autoencoder-som-map.md#L68",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "coordinate_cell_7_0_4_chunks"}), (s:SourceRef {sourceRefId: "source_ref:193405a5e8ff4249"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "environment_verified"})
SET f.title = "Environment Verified",
    f.status = "implemented",
    f.nextQuery = "rg \"Environment Verified\" src docs tests",
    f.semanticHash = "55ae221499539a62";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "environment_verified"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 14, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:96944a53e8a9f058"})
SET s.sourceRef = "local:sveltekit-frontend/scripts/tests/GPU_PIPELINE_RUNNER_TEST_RESULTS.md#L115",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "environment_verified"}), (s:SourceRef {sourceRefId: "source_ref:96944a53e8a9f058"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "execution_overview"})
SET f.title = "Execution Overview",
    f.status = "implemented",
    f.nextQuery = "rg \"Execution Overview\" src docs tests",
    f.semanticHash = "d5df214d628ee588";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "execution_overview"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 15, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:467911c556032bcf"})
SET s.sourceRef = "local:docs/reports/simd-bridge-memory-audit.md#L3",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "execution_overview"}), (s:SourceRef {sourceRefId: "source_ref:467911c556032bcf"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "experimental_libtorch_autoencoder_lane"})
SET f.title = "Experimental libtorch autoencoder lane",
    f.status = "implemented",
    f.nextQuery = "rg \"Experimental libtorch autoencoder lane\" src docs tests",
    f.semanticHash = "db35d9082c543f3f";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "experimental_libtorch_autoencoder_lane"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 16, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:d2b16d3794505dff"})
SET s.sourceRef = "local:docs/reports/audit-summary-report.md#L100",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "experimental_libtorch_autoencoder_lane"}), (s:SourceRef {sourceRefId: "source_ref:d2b16d3794505dff"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "finding_10_libtorch_stubs_cc_1_missing_timeout"})
SET f.title = "Finding #10: libtorch_stubs.cc:1 [MISSING_TIMEOUT]",
    f.status = "implemented",
    f.nextQuery = "rg \"Finding #10: libtorch_stubs.cc:1 [MISSING_TIMEOUT]\" src docs tests",
    f.semanticHash = "ef1217cb967b0e89";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "finding_10_libtorch_stubs_cc_1_missing_timeout"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 17, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:a25ed106b0c2d0e3"})
SET s.sourceRef = "local:docs/reports/simd-bridge-memory-audit.md#L91",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "finding_10_libtorch_stubs_cc_1_missing_timeout"}), (s:SourceRef {sourceRefId: "source_ref:a25ed106b0c2d0e3"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "finding_11_libtorch_stubs_cc_1_missing_cpu_fallback"})
SET f.title = "Finding #11: libtorch_stubs.cc:1 [MISSING_CPU_FALLBACK]",
    f.status = "implemented",
    f.nextQuery = "rg \"Finding #11: libtorch_stubs.cc:1 [MISSING_CPU_FALLBACK]\" src docs tests",
    f.semanticHash = "04b8b2070e150ed1";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "finding_11_libtorch_stubs_cc_1_missing_cpu_fallback"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 18, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:10ac03d75f9f38aa"})
SET s.sourceRef = "local:docs/reports/simd-bridge-memory-audit.md#L98",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "finding_11_libtorch_stubs_cc_1_missing_cpu_fallback"}), (s:SourceRef {sourceRefId: "source_ref:10ac03d75f9f38aa"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "gpu_compute_pipeline_server_side"})
SET f.title = "GPU Compute Pipeline (Server-Side)",
    f.status = "implemented",
    f.nextQuery = "rg \"GPU Compute Pipeline (Server-Side)\" src docs tests",
    f.semanticHash = "cc71fab375ae31b3";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "gpu_compute_pipeline_server_side"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 19, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:bb3e9925d4b695a0"})
SET s.sourceRef = "local:docs/visualization-stack.md#L101",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "gpu_compute_pipeline_server_side"}), (s:SourceRef {sourceRefId: "source_ref:bb3e9925d4b695a0"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "key_rule"})
SET f.title = "Key Rule",
    f.status = "implemented",
    f.nextQuery = "rg \"Key Rule\" src docs tests",
    f.semanticHash = "26ba12cb2512b4aa";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "key_rule"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 20, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:4a611d9e58f279f5"})
SET s.sourceRef = "local:docs/compiler-landscape.md#L115",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "key_rule"}), (s:SourceRef {sourceRefId: "source_ref:4a611d9e58f279f5"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "libtorch_2_9_0_cu130"})
SET f.title = "LibTorch: 2.9.0+cu130",
    f.status = "implemented",
    f.nextQuery = "rg \"LibTorch: 2.9.0+cu130\" src docs tests",
    f.semanticHash = "4f2f9f30cbe29200";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "libtorch_2_9_0_cu130"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 21, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:49721956ff0c6ca7"})
SET s.sourceRef = "local:docs/KARPATHY_PIPELINE_ARCHITECTURE.md#L123",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "libtorch_2_9_0_cu130"}), (s:SourceRef {sourceRefId: "source_ref:49721956ff0c6ca7"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "live_extracts_separate_repos"})
SET f.title = "Live Extracts (Separate Repos)",
    f.status = "implemented",
    f.nextQuery = "rg \"Live Extracts (Separate Repos)\" src docs tests",
    f.semanticHash = "5fbae143bca7d5c0";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "live_extracts_separate_repos"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 22, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:af6eb5f889602e9b"})
SET s.sourceRef = "local:docs/legacy-reference/README.md#L18",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "live_extracts_separate_repos"}), (s:SourceRef {sourceRefId: "source_ref:af6eb5f889602e9b"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "mega_dataset_expansion__root"})
SET f.title = "MEGA_DATASET_EXPANSION",
    f.status = "implemented",
    f.nextQuery = "rg \"MEGA_DATASET_EXPANSION\" src docs tests",
    f.semanticHash = "06c4068ab2f26548";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "mega_dataset_expansion__root"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 23, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:fbfeb2dde7388566"})
SET s.sourceRef = "local:scripts/unsloth-training/MEGA_DATASET_EXPANSION.md#L1",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "mega_dataset_expansion__root"}), (s:SourceRef {sourceRefId: "source_ref:fbfeb2dde7388566"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "pytorch_torchinductor_triton"})
SET f.title = "PyTorch / TorchInductor / Triton",
    f.status = "implemented",
    f.nextQuery = "rg \"PyTorch / TorchInductor / Triton\" src docs tests",
    f.semanticHash = "f786e035ab702f6f";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "pytorch_torchinductor_triton"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 24, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:824d93084b6a94db"})
SET s.sourceRef = "local:docs/compiler-landscape.md#L24",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "pytorch_torchinductor_triton"}), (s:SourceRef {sourceRefId: "source_ref:824d93084b6a94db"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "pytorch_vs_native_n_api_gpu_bridge"})
SET f.title = "PyTorch vs Native N-API GPU Bridge",
    f.status = "implemented",
    f.nextQuery = "rg \"PyTorch vs Native N-API GPU Bridge\" src docs tests",
    f.semanticHash = "006b106cd00e9c26";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:compute_ranking"}), (f:ParentAtlasFeature {featureKey: "pytorch_vs_native_n_api_gpu_bridge"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 25, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:fc7edc79792eff0b"})
SET s.sourceRef = "local:docs/compiler-landscape.md#L100",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "pytorch_vs_native_n_api_gpu_bridge"}), (s:SourceRef {sourceRefId: "source_ref:fc7edc79792eff0b"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"})
SET c.title = "Future Orchestration",
    c.description = "OpenCode, Gemma4, deep_research, MCP tools, and LLM orchestration guardrails.",
    c.matchCount = 169,
    c.sourceRefAnchors = 25,
    c.semanticHash = "e23a07c58a6d1e9c",
    c.primarySourceRef = "local:docs/reports/audit-summary-report.md#L29",
    c.updatedAt = datetime();

MERGE (f:ParentAtlasFeature {featureKey: "expanded_architecture_opencode_ace_graphrag"})
SET f.title = "Expanded Architecture: OpenCode + ACE + GraphRAG",
    f.status = "implemented",
    f.nextQuery = "rg \"Expanded Architecture: OpenCode + ACE + GraphRAG\" src docs tests",
    f.semanticHash = "8fc3873f223028d4";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "expanded_architecture_opencode_ace_graphrag"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 1, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:0ae8ffd97fa70d5e"})
SET s.sourceRef = "local:docs/reports/audit-summary-report.md#L29",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "expanded_architecture_opencode_ace_graphrag"}), (s:SourceRef {sourceRefId: "source_ref:0ae8ffd97fa70d5e"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "opencode_mcp_atlas__root"})
SET f.title = "opencode-mcp-atlas",
    f.status = "implemented",
    f.nextQuery = "rg \"opencode-mcp-atlas\" src docs tests",
    f.semanticHash = "d814009a9eb9becb";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "opencode_mcp_atlas__root"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 2, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:8b8256ec382657ba"})
SET s.sourceRef = "local:docs/ai-os/opencode-mcp-atlas.md#L1",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "opencode_mcp_atlas__root"}), (s:SourceRef {sourceRefId: "source_ref:8b8256ec382657ba"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "three_development_model_lanes_opencode_local_dev"})
SET f.title = "Three Development Model Lanes (OpenCode / local dev)",
    f.status = "implemented",
    f.nextQuery = "rg \"Three Development Model Lanes (OpenCode / local dev)\" src docs tests",
    f.semanticHash = "5ba79a1fd5f46f83";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "three_development_model_lanes_opencode_local_dev"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 3, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:a08f4f973a1501b0"})
SET s.sourceRef = "local:docs/llms/gguf-model-lanes.md#L86",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "three_development_model_lanes_opencode_local_dev"}), (s:SourceRef {sourceRefId: "source_ref:a08f4f973a1501b0"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "trace_karpathy_performance_lane_deep_research_plan"})
SET f.title = "TRACE/Karpathy Performance Lane — Deep Research Plan",
    f.status = "implemented",
    f.nextQuery = "rg \"TRACE/Karpathy Performance Lane — Deep Research Plan\" src docs tests",
    f.semanticHash = "ca1d10753a423a27";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "trace_karpathy_performance_lane_deep_research_plan"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 4, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:8fdf7ebb369cb033"})
SET s.sourceRef = "local:docs/research/deep-research-topics.md#L1",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "trace_karpathy_performance_lane_deep_research_plan"}), (s:SourceRef {sourceRefId: "source_ref:8fdf7ebb369cb033"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "unified_context_tree"})
SET f.title = "Unified context tree",
    f.status = "implemented",
    f.nextQuery = "rg \"Unified context tree\" src docs tests",
    f.semanticHash = "8de9137e0b224785";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "unified_context_tree"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 5, score: 3}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:c07e571c6cfa0923"})
SET s.sourceRef = "local:docs/reports/audit-summary-report.md#L32",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "unified_context_tree"}), (s:SourceRef {sourceRefId: "source_ref:c07e571c6cfa0923"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "10_mcp_tool_boundary"})
SET f.title = "10. MCP Tool Boundary",
    f.status = "implemented",
    f.nextQuery = "rg \"10. MCP Tool Boundary\" src docs tests",
    f.semanticHash = "f140a62a01c1ec68";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "10_mcp_tool_boundary"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 6, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:9abeb9afdccbc978"})
SET s.sourceRef = "local:docs/architecture/trace-kag-web-development-guide.md#L51",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "10_mcp_tool_boundary"}), (s:SourceRef {sourceRefId: "source_ref:9abeb9afdccbc978"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "2_data_access_rules_mcp_to_gemma4_trace"})
SET f.title = "2. Data Access Rules (MCP $\\to$ Gemma4/Trace)",
    f.status = "implemented",
    f.nextQuery = "rg \"2. Data Access Rules (MCP $\\to$ Gemma4/Trace)\" src docs tests",
    f.semanticHash = "859b29b619f13407";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "2_data_access_rules_mcp_to_gemma4_trace"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 7, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:f3aaf5a0c69daa69"})
SET s.sourceRef = "local:docs/ARCHITECTURE_GUIDE_V1.md#L17",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "2_data_access_rules_mcp_to_gemma4_trace"}), (s:SourceRef {sourceRefId: "source_ref:f3aaf5a0c69daa69"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "b_generation_lane_llama_server"})
SET f.title = "B. Generation Lane (llama-server)",
    f.status = "implemented",
    f.nextQuery = "rg \"B. Generation Lane (llama-server)\" src docs tests",
    f.semanticHash = "836202076bf276a3";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "b_generation_lane_llama_server"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 8, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:dbaedfb7eb2371cb"})
SET s.sourceRef = "local:docs/KARPATHY_PIPELINE_ARCHITECTURE.md#L21",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "b_generation_lane_llama_server"}), (s:SourceRef {sourceRefId: "source_ref:dbaedfb7eb2371cb"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "boundary_rule"})
SET f.title = "Boundary Rule",
    f.status = "implemented",
    f.nextQuery = "rg \"Boundary Rule\" src docs tests",
    f.semanticHash = "157debc89f735811";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "boundary_rule"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 9, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:e317fd8e2682e1fd"})
SET s.sourceRef = "local:docs/architecture/trace-runtime-split.md#L31",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "boundary_rule"}), (s:SourceRef {sourceRefId: "source_ref:e317fd8e2682e1fd"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "cross_references"})
SET f.title = "Cross-references",
    f.status = "implemented",
    f.nextQuery = "rg \"Cross-references\" src docs tests",
    f.semanticHash = "9d4877a378bf5750";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "cross_references"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 10, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:c5a0b195a3707df9"})
SET s.sourceRef = "local:sveltekit-frontend/scripts/setup/hermes/README.md#L150",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "cross_references"}), (s:SourceRef {sourceRefId: "source_ref:c5a0b195a3707df9"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "gemma4_agentic_tool_calling"})
SET f.title = "Gemma4 Agentic Tool Calling",
    f.status = "implemented",
    f.nextQuery = "rg \"Gemma4 Agentic Tool Calling\" src docs tests",
    f.semanticHash = "2cf13890c33fb663";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "gemma4_agentic_tool_calling"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 11, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:46d747fa74a1b2b4"})
SET s.sourceRef = "local:sveltekit-frontend/scripts/docs/startup-guide.md#L133",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "gemma4_agentic_tool_calling"}), (s:SourceRef {sourceRefId: "source_ref:46d747fa74a1b2b4"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "google_agent2agent_a2a_protocol_not_in_tsgo"})
SET f.title = "Google Agent2Agent (A2A) Protocol — ❌ NOT in tsgo",
    f.status = "implemented",
    f.nextQuery = "rg \"Google Agent2Agent (A2A) Protocol — ❌ NOT in tsgo\" src docs tests",
    f.semanticHash = "f6f512b1418cd0e7";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "google_agent2agent_a2a_protocol_not_in_tsgo"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 12, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:97a951b3b28adff2"})
SET s.sourceRef = "local:sveltekit-frontend/scripts/docs/typescript-7-release-notes.md#L294",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "google_agent2agent_a2a_protocol_not_in_tsgo"}), (s:SourceRef {sourceRefId: "source_ref:97a951b3b28adff2"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "implementation_order"})
SET f.title = "Implementation order",
    f.status = "implemented",
    f.nextQuery = "rg \"Implementation order\" src docs tests",
    f.semanticHash = "0f1610bcf03c2b82";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "implementation_order"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 13, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:b873dba1b17e6fdc"})
SET s.sourceRef = "local:docs/reports/audit-summary-report.md#L139",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "implementation_order"}), (s:SourceRef {sourceRefId: "source_ref:b873dba1b17e6fdc"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "lane_a"})
SET f.title = "Lane A",
    f.status = "implemented",
    f.nextQuery = "rg \"Lane A\" src docs tests",
    f.semanticHash = "f9b7879635851164";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "lane_a"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 14, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:2f74b2e9febaa38e"})
SET s.sourceRef = "local:docs/llms/gguf-model-lanes.md#L99",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "lane_a"}), (s:SourceRef {sourceRefId: "source_ref:2f74b2e9febaa38e"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "lane_b_default"})
SET f.title = "Lane B (default)",
    f.status = "implemented",
    f.nextQuery = "rg \"Lane B (default)\" src docs tests",
    f.semanticHash = "3ec300b64efd4206";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "lane_b_default"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 15, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:a69ae8164e561ce6"})
SET s.sourceRef = "local:docs/llms/gguf-model-lanes.md#L102",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "lane_b_default"}), (s:SourceRef {sourceRefId: "source_ref:a69ae8164e561ce6"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "mcp_searchability"})
SET f.title = "MCP searchability",
    f.status = "implemented",
    f.nextQuery = "rg \"MCP searchability\" src docs tests",
    f.semanticHash = "798a71aa61e68960";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "mcp_searchability"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 16, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:77df3f48ed7edea1"})
SET s.sourceRef = "local:docs/research/deep-research-topics.md#L218",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "mcp_searchability"}), (s:SourceRef {sourceRefId: "source_ref:77df3f48ed7edea1"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "openai_context_compaction_integration_plan__root"})
SET f.title = "openai-context-compaction-integration-plan",
    f.status = "implemented",
    f.nextQuery = "rg \"openai-context-compaction-integration-plan\" src docs tests",
    f.semanticHash = "e4c6248221b0b342";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "openai_context_compaction_integration_plan__root"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 17, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:bb61f3b2a11af717"})
SET s.sourceRef = "local:docs/reports/openai-context-compaction-integration-plan.md#L1",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "openai_context_compaction_integration_plan__root"}), (s:SourceRef {sourceRefId: "source_ref:bb61f3b2a11af717"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "service_map"})
SET f.title = "Service Map",
    f.status = "implemented",
    f.nextQuery = "rg \"Service Map\" src docs tests",
    f.semanticHash = "5bcfe758b9e9e8ba";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "service_map"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 18, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:a710858662abed97"})
SET s.sourceRef = "local:sveltekit-frontend/scripts/docs/startup-guide.md#L7",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "service_map"}), (s:SourceRef {sourceRefId: "source_ref:a710858662abed97"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "a2a_integration_guide__sources"})
SET f.title = "Sources",
    f.status = "implemented",
    f.nextQuery = "rg \"Sources\" src docs tests",
    f.semanticHash = "f8d433c51f06ac09";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "a2a_integration_guide__sources"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 19, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:3db1ccf79b269435"})
SET s.sourceRef = "local:sveltekit-frontend/scripts/docs/a2a-integration-guide.md#L505",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "a2a_integration_guide__sources"}), (s:SourceRef {sourceRefId: "source_ref:3db1ccf79b269435"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "step_5_feat_agent_wire_gemma4_tool_call_controller_to_typescript_mcp_graph_search_tools"})
SET f.title = "Step 5 — feat(agent): wire Gemma4 tool-call controller to TypeScript MCP graph/search tools",
    f.status = "implemented",
    f.nextQuery = "rg \"Step 5 — feat(agent): wire Gemma4 tool-call controller to TypeScript MCP graph/search tools\" src docs tests",
    f.semanticHash = "85a82e1407b1ce58";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "step_5_feat_agent_wire_gemma4_tool_call_controller_to_typescript_mcp_graph_search_tools"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 20, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:069a51987d608cfa"})
SET s.sourceRef = "local:docs/research/deep-research-topics.md#L146",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "step_5_feat_agent_wire_gemma4_tool_call_controller_to_typescript_mcp_graph_search_tools"}), (s:SourceRef {sourceRefId: "source_ref:069a51987d608cfa"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "tool_call_flow"})
SET f.title = "Tool call flow",
    f.status = "implemented",
    f.nextQuery = "rg \"Tool call flow\" src docs tests",
    f.semanticHash = "b1239e956954034a";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "tool_call_flow"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 21, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:bb38c749d51fc6ea"})
SET s.sourceRef = "local:docs/research/deep-research-topics.md#L165",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "tool_call_flow"}), (s:SourceRef {sourceRefId: "source_ref:bb38c749d51fc6ea"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "tools"})
SET f.title = "Tools",
    f.status = "implemented",
    f.nextQuery = "rg \"Tools\" src docs tests",
    f.semanticHash = "437b4c1ee338f397";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "tools"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 22, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:db2f59acfa315568"})
SET s.sourceRef = "local:scripts/analysis_reports/LLMS.md#L26",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "tools"}), (s:SourceRef {sourceRefId: "source_ref:db2f59acfa315568"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "llms__tools"})
SET f.title = "Tools",
    f.status = "implemented",
    f.nextQuery = "rg \"Tools\" src docs tests",
    f.semanticHash = "860b2b61326d7329";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "llms__tools"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 23, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:0d22a05d1344b437"})
SET s.sourceRef = "local:vscode-extension/src/LLMS.md#L26",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "llms__tools"}), (s:SourceRef {sourceRefId: "source_ref:0d22a05d1344b437"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "topological_db_backends_summary"})
SET f.title = "Topological DB Backends (summary)",
    f.status = "implemented",
    f.nextQuery = "rg \"Topological DB Backends (summary)\" src docs tests",
    f.semanticHash = "304c842fe0cab563";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "topological_db_backends_summary"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 24, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:131c4b3e2203b604"})
SET s.sourceRef = "local:docs/CODEBASE_INDEXING_PIPELINE.md#L242",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "topological_db_backends_summary"}), (s:SourceRef {sourceRefId: "source_ref:131c4b3e2203b604"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

MERGE (f:ParentAtlasFeature {featureKey: "where_each_technology_fits"})
SET f.title = "Where each technology fits",
    f.status = "implemented",
    f.nextQuery = "rg \"Where each technology fits\" src docs tests",
    f.semanticHash = "10c2d5a58238462a";
MATCH (c:ParentAtlasContainer {containerId: "parent_atlas:orchestration_future"}), (f:ParentAtlasFeature {featureKey: "where_each_technology_fits"})
MERGE (c)-[:CONTAINS_FEATURE {rank: 25, score: 2}]->(f);

MERGE (s:SourceRef {sourceRefId: "source_ref:9229526fb70ab650"})
SET s.sourceRef = "local:docs/reports/audit-summary-report.md#L38",
    s.kind = 'sourceRef',
    s.updatedAt = datetime();
MATCH (f:ParentAtlasFeature {featureKey: "where_each_technology_fits"}), (s:SourceRef {sourceRefId: "source_ref:9229526fb70ab650"})
MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);

