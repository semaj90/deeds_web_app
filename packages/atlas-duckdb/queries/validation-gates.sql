SELECT
  'snapshot_packets' AS name,
  COUNT(*) > 0 AS passed,
  'rows=' || COUNT(*)::VARCHAR AS detail
FROM snapshot_packets;
