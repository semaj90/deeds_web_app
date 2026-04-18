-- 4D hypergraph manifold coordinates for research_summaries
-- Populated by buildHypergraph4D() via writeManifold4ToDB() after SOM+k-means.
-- NULL until the first hypergraph build runs.
--
-- manifold4[1] = som_x      SOM BMU x-coordinate (0–11, 12×12 grid)
-- manifold4[2] = som_y      SOM BMU y-coordinate (0–11)
-- manifold4[3] = semantic_z cosine distance to assigned centroid [0,1]
-- manifold4[4] = grpo_w     GRPO reward score [0,1]

ALTER TABLE research_summaries
  ADD COLUMN IF NOT EXISTS manifold4 real[];
