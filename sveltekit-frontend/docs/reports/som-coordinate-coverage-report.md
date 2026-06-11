# SOM Coordinate Coverage Report

Generated: 2026-06-11T03:38:52.396Z
Limit: 5000

## Service Status

- Qdrant: READY (scanned 5000 points)
- Postgres: READY (matched 0 rows)
- SOM topology file: READY (C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\.tmp\offline-analysis\cluster-topology.json)

## Summary

- Scanned points: 5000
- Missing somRow/somCol: 0
- With direct coordinates: 5000
- Missing somRow: 0
- Missing somCol: 0
- sourceRef coverage among missing: 0.0%
- featureId coverage among missing: 0.0%
- somCluster anchors among missing: 0.0%
- centroidId anchors among missing: 0.0%

## Recoverability


## Samples

| point_id | classification | source_ref | feature_id | som_cluster | centroid_id | derived_coords | note |
|---|---|---|---|---|---|---|---|

## Evidence

- cluster-topology entries: 100
- centroid map entries: 20
- pg evidence rows: 0
- points with sourceRef/featureId but missing coords: 0
- points with no topology anchors at all: 0
