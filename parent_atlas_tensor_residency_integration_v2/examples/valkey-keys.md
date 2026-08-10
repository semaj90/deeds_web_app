# Suggested Valkey / BitFrost keys

```text
atlas:tensor:tile:<workspace_revision>:<tile_key>
atlas:tensor:centroids:<representation_revision>
atlas:ann-route:<query_hash>:<representation_revision>:<ann_index_revision>:...
atlas:tensor:invalidations:<workspace_revision>
```

Cache values are hints/manifests only. Use TTLs plus revision-qualified invalidation. If the invalidation channel/tracking connection is lost, flush the corresponding local in-process cache rather than serving potentially stale data indefinitely.
