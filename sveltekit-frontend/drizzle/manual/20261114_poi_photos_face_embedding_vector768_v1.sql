-- Aligns poi_photos.face_embedding with the Drizzle schema (vector(768)); the live column was text
-- holding JSON-array literals, so vector distance queries on it could not run.
-- Pre-image (2026-11-14): 4 non-null rows, all 768 values; saved to
--   docs/reports/archive/2026-11-14-poi-photos-face-embedding-preimage/preimage.jsonl
-- Post-check: column type vector(768); every non-null row has vector_dims = 768.
-- Note: these vectors are caption-text embeddings from the v1 model, not face or image embeddings.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.poi_photos'::regclass
             AND attname = 'face_embedding' AND format_type(atttypid, atttypmod) = 'vector(768)') THEN
    RAISE NOTICE 'poi_photos.face_embedding is already vector(768)';
  ELSE
    ALTER TABLE public.poi_photos
      ALTER COLUMN face_embedding TYPE vector(768) USING face_embedding::vector(768);
  END IF;
END $$;
