-- Manual migration for poi_photos table
-- Created: 2026-03-04
-- Purpose: Store POI photos in MinIO with metadata + AI analysis

CREATE TABLE IF NOT EXISTS "poi_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poi_id" uuid NOT NULL,
	"minio_key" text NOT NULL,
	"thumbnail_key" text,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" bigint NOT NULL,
	"ai_caption" text,
	"ai_tags" jsonb DEFAULT '[]',
	"exif_data" jsonb,
	"forensic_data" jsonb,
	"face_embedding" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Add foreign key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'poi_photos_poi_id_persons_id_fk'
  ) THEN
    ALTER TABLE "poi_photos" ADD CONSTRAINT "poi_photos_poi_id_persons_id_fk"
      FOREIGN KEY ("poi_id") REFERENCES "public"."persons_of_interest"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS "idx_poi_photos_poi_id" ON "poi_photos" USING btree ("poi_id");
CREATE INDEX IF NOT EXISTS "idx_poi_photos_uploaded_at" ON "poi_photos" USING btree ("uploaded_at");