# Gemma4 Context Test

Generated: 2026-06-21T21:12:08.011Z
App URL: http://localhost:5173
Seed source: atlas_packets
Query: Utility utility sveltekit-frontend/src/lib/components/detective/UploadZone.svelte visibility 20260621211206

## Summary

- Status: ok
- Result count: 5
- All required visible: yes

## Field Coverage

- feature_id: 5
- source_ref: 5
- metadata: 5
- qdrant_tag_id: 5
- cluster_id: 5
- community_id: 5
- som_cluster: 5
- karpathy_score: 5
- redis_hot_key: 5
- neo4j_node: 5
- domain: 5
- ontology: 5

## Gemma4 Visible Context Sample

```json
{
  "feature_id": "utility",
  "source_ref": "sveltekit-frontend/src/lib/components/evidence/EvidencePrimaryUpload.svelte",
  "metadata": {
    "ae_epoch": 60,
    "app_root": "sveltekit-frontend",
    "file_path": "sveltekit-frontend/src/lib/components/evidence/EvidencePrimaryUpload.svelte",
    "repo_root": "deeds-web-app",
    "ae_val_loss": 0.0007358284494839609,
    "ae_timestamp": "2026-06-19T16:13:04Z",
    "cache_context": {},
    "directory_path": "sveltekit-frontend/src/lib/components/evidence",
    "derived_enrichment": {
      "entities": [
        {
          "end": 3597,
          "text": "text",
          "type": "database_schema",
          "start": 3593,
          "confidence": 0.9
        },
        {
          "end": 5346,
          "text": "text",
          "type": "database_schema",
          "start": 5342,
          "confidence": 0.9
        },
        {
          "end": 7328,
          "text": "text",
          "type": "database_schema",
          "start": 7324,
          "confidence": 0.9
        },
        {
          "end": 9514,
          "text": "text",
          "type": "database_schema",
          "start": 9510,
          "confidence": 0.9
        },
        {
          "end": 9810,
          "text": "text",
          "type": "database_schema",
          "start": 9806,
          "confidence": 0.9
        },
        {
          "end": 10857,
          "text": "text",
          "type": "database_schema",
          "start": 10853,
          "confidence": 0.9
        },
        {
          "end": 11667,
          "text": "text",
          "type": "database_schema",
          "start": 11663,
          "confidence": 0.9
        },
        {
          "end": 4147,
          "text": "POST",
          "type": "route_handler",
          "start": 4143,
          "confidence": 0.9
        }
      ]
    }
  },
  "qdrant_tag_id": "1783417747",
  "cluster_id": 0,
  "community_id": 5774,
  "som_cluster": 0,
  "karpathy_score": 0.4688766300678253,
  "redis_hot_key": "redis:src/lib/components/evidence/EvidencePrimaryUpload.svelte:34a413faba84fbd5",
  "neo4j_node": "neo4j:sveltekit-frontend/src/lib/components/evidence/EvidencePrimaryUpload.svelte",
  "domain": "utility",
  "ontology": [
    "utility"
  ]
}
```

## Seed

```json
{
  "id": "e1f73006-03eb-4748-9b1b-38a198f0a875",
  "source_ref": "sveltekit-frontend/src/lib/components/detective/UploadZone.svelte",
  "feature_id": "utility",
  "feature_label": "Utility",
  "qdrant_tag_id": null,
  "cluster_id": 0,
  "community_id": 5781,
  "som_cluster": null,
  "domain_class": null
}
```