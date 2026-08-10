# N-ary / RAPIDS Metrics

N-ary events are stored as hyperedge membership rows, not forced into ordered tuples. Ordered execution remains a DAG/RouteTrace concern.

An incidence artifact stores `(hyperedge_id, vertex_id, role, weight)` in Arrow. A later GPU experiment may compile this into sparse COO/CSR for vertex→hyperedge and hyperedge→vertex aggregation.

Graph metrics such as PageRank, Louvain, k-core and betweenness remain graph-analysis outputs. KMeans labels/distances are clustering outputs. Semantic cosine is a semantic metric. Do not put them under one generic trigger threshold.
