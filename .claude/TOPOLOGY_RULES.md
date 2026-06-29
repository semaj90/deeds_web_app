# TOPOLOGY_RULES

Topology defines neighborhoods and routing.

Coordinates:
- x = som_row
- y = som_col
- z = cluster_id
- t = timestamp

## Hard Rules
- SOM is topology only.
- latent_64 is routing only.
- topology never replaces ontology.

## Allowed
- SOM 20x20
- kmeans clustering
- BFS
- k-hop traversal
