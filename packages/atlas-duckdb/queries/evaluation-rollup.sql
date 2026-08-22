SELECT
  split_name,
  COUNT(*) AS row_count
FROM grouped_splits
GROUP BY split_name
ORDER BY split_name;
