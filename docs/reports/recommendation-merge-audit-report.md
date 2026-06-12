# Recommendation Merge Audit

Generated: 2026-06-12T19:22:46.894Z

## Snapshot
- totalCount: 5
- clusterCount: 2
- top10Count: 5
- eventsCount: 0

## Source Surfaces
- .opencode/recommendations/recommendations.json: present
- .opencode/recommendations/recommendation-events.jsonl: missing
- docs/graph/recommendations.json: missing
- docs/phase100/feature-recommendations.json: present
- memory/exports/next-moves-recommendation.json: present

## Likely Reasons
- current snapshot is intentionally small and gate-filtered
- recommendations are dominated by missing_feature gates
- docs/graph/recommendations.json is absent or unreadable

## Recommendation Types
- missing_feature
