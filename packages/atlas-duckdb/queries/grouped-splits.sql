-- train/validation/test split assignment by source group
SELECT
  packet_key,
  source_ref,
  label,
  text,
  source_group,
  content_hash,
  CASE
    WHEN hash(source_group || ':42') % 100 < 70 THEN 'train'
    WHEN hash(source_group || ':42') % 100 < 85 THEN 'validation'
    ELSE 'test'
  END AS split_name
FROM domain_training_rows;
