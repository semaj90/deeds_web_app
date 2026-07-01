# Ranker Envelope Readiness

Generated: 2026-07-01T22:21:30.187Z
Status: WARN
Blocked apply: false

| lane | status | notes |
|---|---:|---|
| embedding_qdrant_turbovec | LIVE_PASS | {"status":"LIVE_PASS","source":"docs/reports/embedding-qdrant-turbovec-proof.json","embeddinggemma":"LIVE_PASS","qdrant":"LIVE_PASS","turbovec_grpc":"LIVE_PASS"} |
| active_ranker_envelope | WARN | {"status":"WARN","candidates":5000,"identity_pct":100,"score_pct":100,"provenance_pct":100,"missing_required":[],"weak_feature_id_count":2,"weak_feature_id_rule":"Canonical Postgres feature_id values are preserved for summary ingestion; weak labels are reported for later feature_id coverage repair.","coarse_feature_ids":[{"packet_key":"packet:6ebdb617a810","feature_id":"CLAUDE"},{"packet_key":"packet:00ce699acf88","feature_id":"valkey"}]} |
| summary_context_envelope | LIVE_PASS | {"status":"LIVE_PASS","identity_required_pct":100,"domain_pct":100,"ontology_pct":100,"topology_pct":100,"content_ref_pct":100} |
| summary_test10 | LIVE_PASS | {"status":"LIVE_PASS","source":".tmp/gemma4-parent-atlas-summary-cache-report.json","mode":"dry-run","rows_queued":10,"failed":0,"wouldCallLlama":10,"llamaCalls":0} |
| ontology_kag_readiness | WARN | {"status":"WARN","source":"docs/reports/ontology-kag-readiness.json","candidates":null,"weak_metrics":[]} |

Next action: Ranker envelope is ready for bounded summary apply; ontology weak metrics remain prioritization guidance.
