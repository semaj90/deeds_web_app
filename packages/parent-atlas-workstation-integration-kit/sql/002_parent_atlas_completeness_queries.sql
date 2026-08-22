-- Identity coverage.
SELECT
  count(*) AS total_rows,
  count(packet_id) AS packet_id_rows,
  count(packet_key) AS packet_key_rows,
  count(*) - count(packet_key) AS missing_packet_key,
  count(DISTINCT packet_key) AS distinct_packet_keys
FROM public.atlas_packets;

-- Duplicate packet keys.
SELECT packet_key, count(*) AS occurrences
FROM public.atlas_packets
WHERE packet_key IS NOT NULL
GROUP BY packet_key
HAVING count(*) > 1
ORDER BY occurrences DESC, packet_key;

-- Projection coverage.
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE qdrant_point_id IS NOT NULL) AS qdrant,
  count(*) FILTER (WHERE neo4j_node_id IS NOT NULL) AS neo4j,
  count(*) FILTER (WHERE pagerank IS NOT NULL) AS pagerank,
  count(*) FILTER (WHERE summary IS NOT NULL AND summary <> '') AS summaries,
  count(*) FILTER (WHERE domain_class IS NOT NULL) AS domain_class,
  count(*) FILTER (WHERE representation_id IS NOT NULL) AS representation_lineage
FROM public.atlas_packets;

-- Wide-row and serialization diagnostics.
SELECT
  count(*) AS row_count,
  avg(pg_column_size(t))::bigint AS avg_row_bytes,
  max(pg_column_size(t)) AS max_row_bytes
FROM public.atlas_packets t;

-- Narrow keyset query plan.
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, TIMING)
SELECT packet_id, packet_key, source_ref, sha256, qdrant_point_id, neo4j_node_id, updated_at
FROM public.atlas_packets
WHERE packet_id > ''
ORDER BY packet_id
LIMIT 500;
