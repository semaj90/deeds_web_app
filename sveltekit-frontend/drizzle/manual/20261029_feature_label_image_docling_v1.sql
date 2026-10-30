-- Proposal: semantic feature_label for image-synthesis / docling-vlm / gaussian-splat packets.
-- APPLIED 2026-10-29 with operator approval (ROLLBACK test passed first; mirrors checked: Redis none, Qdrant legacy codebase_chunks_768 only).
-- Identity: match packet_key AND source_ref AND the exact current label (compare-and-set). feature_id is NOT touched
-- (it is filename-derived and collides; never join on it alone). Pre-image is kept in metadata.feature_label_history.
-- Pre-image (2026-10-29): packet:7adb63a91858 'app.py'; packet:e0345940e5a7 'app.py';
--   packet:7bdb227c5113 'gaussian-splat-renderer.ts'; ace:packet:d7a24411ac72 'gaussian-splat-renderer'.
-- Not covered: /glyph/condition (a code region of app.py, not its own packet).
BEGIN;

WITH proposal(packet_key, source_ref, old_label, new_label) AS (VALUES
  ('packet:7adb63a91858', 'docker/image-synthesis/app.py', 'app.py', 'image-synthesis.crime-scene-reconstruction'),
  ('packet:e0345940e5a7', 'docker/docling-vlm/app.py', 'app.py', 'docling-vlm.document-vision-audio'),
  ('packet:7bdb227c5113', 'sveltekit-frontend/src/lib/webgpu/gaussian-splat-renderer.ts', 'gaussian-splat-renderer.ts', 'webgpu.gaussian-splat-renderer'),
  ('ace:packet:d7a24411ac72', 'src/lib/webgpu/gaussian-splat-renderer.ts', 'gaussian-splat-renderer', 'webgpu.gaussian-splat-renderer')
), upd AS (
  UPDATE atlas_packets p
     SET feature_label = pr.new_label,
         metadata = jsonb_set(coalesce(p.metadata, '{}'::jsonb), '{feature_label_history}',
                    coalesce(p.metadata->'feature_label_history', '[]'::jsonb)
                    || jsonb_build_array(jsonb_build_object('from', pr.old_label, 'to', pr.new_label, 'at', now(), 'change', '20261029_feature_label_image_docling_v1'))),
         updated_at = now()
    FROM proposal pr
   WHERE p.packet_key = pr.packet_key AND p.source_ref = pr.source_ref AND p.feature_label = pr.old_label
  RETURNING p.packet_key
)
SELECT count(*) AS rows_updated FROM upd;   -- expect 4

-- Post-check
SELECT packet_key, feature_label FROM atlas_packets
 WHERE packet_key IN ('packet:7adb63a91858','packet:e0345940e5a7','packet:7bdb227c5113','ace:packet:d7a24411ac72');

COMMIT;
