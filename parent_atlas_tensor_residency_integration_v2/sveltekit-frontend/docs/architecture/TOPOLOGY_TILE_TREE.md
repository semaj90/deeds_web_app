# TopologyTileTree

A BVH-like hierarchy may be used for visualization culling and ACE prefetch prediction over `TopologyCoordinate4 = [som_x, som_y, authority, entropy_utility]`.

It must not replace HNSW/CAGRA semantic ANN, Neo4j/cuGraph topology, or packet identity.

Suggested hierarchy:

`domain/community -> SOM region -> TileKey -> packet IDs`

Each node stores bounded ranges and child/tile references. Query/view points traverse only intersecting nodes. The result is a list of candidate TileKeys for ACE to score; ACE remains the residency owner.
