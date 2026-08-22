-- domain_training_rows: set-oriented training rows
WITH base AS (
  SELECT
    packet_key,
    source_ref,
    normalized_domain AS label,
    concat_ws(' ', coalesce(summary, ''), coalesce(source_ref, '')) AS text,
    regexp_replace(source_ref, ':[0-9]+(:[0-9]+)?$', '') AS source_group,
    content_hash
  FROM snapshot_packets
  WHERE normalized_domain IS NOT NULL
),
deduplicated AS (
  SELECT
    *,
    row_number() OVER (
      PARTITION BY coalesce(content_hash, packet_key)
      ORDER BY packet_key
    ) AS duplicate_rank
  FROM base
)
SELECT
  packet_key,
  source_ref,
  label,
  text,
  source_group,
  content_hash
FROM deduplicated
WHERE duplicate_rank = 1;
