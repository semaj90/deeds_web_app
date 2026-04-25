-- Migration: Create images table for Gemma3 VLM integration
-- Date: 2025-11-29
-- Description: Stores images extracted from search results with visual analysis and embeddings

CREATE TABLE IF NOT EXISTS images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_path VARCHAR NOT NULL,
    minio_path VARCHAR,
    extracted_text TEXT,
    visual_objects TEXT[],
    scene_description TEXT,
    relationships TEXT[],
    embedding vector(768),
    confidence FLOAT,
    source_url VARCHAR,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_images_source ON images(source_url);
CREATE INDEX IF NOT EXISTS idx_images_confidence ON images(confidence);
CREATE INDEX IF NOT EXISTS idx_images_created ON images(created_at);

-- Create GiST index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_images_embedding ON images USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

COMMENT ON TABLE images IS 'Stores images extracted from search results with visual analysis and embeddings';
COMMENT ON COLUMN images.file_path IS 'Local file path of the image';
COMMENT ON COLUMN images.minio_path IS 'Path in MinIO object storage';
COMMENT ON COLUMN images.extracted_text IS 'Text extracted from the image using Gemma3 VLM';
COMMENT ON COLUMN images.visual_objects IS 'Array of objects detected in the image';
COMMENT ON COLUMN images.scene_description IS 'Description of the scene in the image';
COMMENT ON COLUMN images.relationships IS 'Array of relationships between objects in the image';
COMMENT ON COLUMN images.embedding IS 'Vector embedding of the image for similarity search';
COMMENT ON COLUMN images.confidence IS 'Confidence score of the visual analysis (0-1)';
