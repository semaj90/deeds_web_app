-- Migration: Upgrade embedding vectors from 768 to 1024 for Gemma-3 VLM
-- Date: 2025-12-08
-- Purpose: Support multimodal embeddings from Gemma-3 Vision Language Model

-- Step 1: Create new embedding columns with 1024 dimensions
ALTER TABLE legal_documents
ADD COLUMN embedding_vlm vector(1024);

ALTER TABLE document_embeddings
ADD COLUMN embedding_vlm vector(1024);

ALTER TABLE evidence_chunks
ADD COLUMN embedding_vlm vector(1024);

ALTER TABLE statute_chunks
ADD COLUMN embedding_vlm vector(1024);

-- Step 2: Create new table for omni-modal embeddings (text + vision + layout)
CREATE TABLE IF NOT EXISTS legal_embeddings_omni (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES legal_documents(id) ON DELETE CASCADE,
  chunk_id uuid,
  content text NOT NULL,
  embedding vector(1024) NOT NULL,
  embedding_hash text UNIQUE,
  modality text DEFAULT 'text', -- 'text', 'vision', 'layout', 'multimodal'
  seals jsonb, -- Detected seals/signatures from YOLO
  layout_boxes jsonb, -- Bounding boxes from DocLing
  ocr_text text, -- OCR output from TrOCR
  confidence real DEFAULT 0.8,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

-- Step 3: Create indexes for performance
CREATE INDEX idx_legal_embeddings_omni_document_id ON legal_embeddings_omni(document_id);
CREATE INDEX idx_legal_embeddings_omni_modality ON legal_embeddings_omni(modality);
CREATE INDEX idx_legal_embeddings_omni_embedding ON legal_embeddings_omni USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_legal_embeddings_omni_hash ON legal_embeddings_omni(embedding_hash);
CREATE INDEX idx_legal_embeddings_omni_created_at ON legal_embeddings_omni(created_at);

-- Step 4: Create table for California Constitution ingestion
CREATE TABLE IF NOT EXISTS ca_constitution_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article text NOT NULL, -- e.g., "I", "VI", "XIV"
  section text NOT NULL, -- e.g., "1", "5"
  subsection text, -- e.g., "a", "b"
  title text,
  content text NOT NULL,
  full_citation text UNIQUE, -- e.g., "ca.const.article.I.section.1"
  embedding vector(1024),
  authority_weight real DEFAULT 1.0, -- PageRank-style authority
  source text, -- 'legislature_pdf', 'leginfo_gov', 'cornell_lii'
  cross_references jsonb, -- Links to other sections, statutes, case law
  metadata jsonb,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

-- Step 5: Create indexes for CA Constitution
CREATE INDEX idx_ca_const_article ON ca_constitution_sections(article);
CREATE INDEX idx_ca_const_section ON ca_constitution_sections(section);
CREATE INDEX idx_ca_const_citation ON ca_constitution_sections(full_citation);
CREATE INDEX idx_ca_const_embedding ON ca_constitution_sections USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_ca_const_authority ON ca_constitution_sections(authority_weight DESC);

-- Step 6: Create table for keyword extraction results
CREATE TABLE IF NOT EXISTS document_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES legal_documents(id) ON DELETE CASCADE,
  chat_turn_id uuid, -- Optional link to chat turn
  keywords text[] NOT NULL,
  key_phrases text[] NOT NULL,
  entities jsonb NOT NULL, -- Array of {text, type, confidence}
  topics text[] NOT NULL,
  summary text,
  extraction_method text DEFAULT 'ollama', -- 'ollama' or 'fallback'
  confidence real DEFAULT 0.8,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

-- Step 7: Create indexes for keywords
CREATE INDEX idx_document_keywords_document_id ON document_keywords(document_id);
CREATE INDEX idx_document_keywords_chat_turn_id ON document_keywords(chat_turn_id);
CREATE INDEX idx_document_keywords_keywords ON document_keywords USING gin(keywords);
CREATE INDEX idx_document_keywords_topics ON document_keywords USING gin(topics);

-- Step 8: Update chat_turns table to include keywords
ALTER TABLE chat_turns
ADD COLUMN keywords text[] DEFAULT '{}',
ADD COLUMN key_phrases text[] DEFAULT '{}',
ADD COLUMN extracted_entities jsonb DEFAULT '[]',
ADD COLUMN suggestions jsonb DEFAULT '[]';

-- Step 9: Create indexes for chat enhancements
CREATE INDEX idx_chat_turns_keywords ON chat_turns USING gin(keywords);
CREATE INDEX idx_chat_turns_suggestions ON chat_turns USING gin(suggestions);

-- Step 10: Create table for VLM model metadata
CREATE TABLE IF NOT EXISTS vlm_model_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name text UNIQUE NOT NULL, -- e.g., 'gemma-3-2b-it-v'
  model_version text,
  embedding_dimension integer DEFAULT 1024,
  quantization_type text, -- 'fp16', 'int8', 'nf4', 'hybrid'
  vision_tower_quantization text, -- 'int8', 'fp16'
  text_tower_quantization text, -- 'nf4', 'fp16'
  lora_adapters jsonb, -- Trained LoRA adapter info
  training_dataset text, -- 'f1', 'f2', 'f3', 'f4'
  training_date timestamp with time zone,
  performance_metrics jsonb, -- Benchmarks, accuracy, latency
  metadata jsonb,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

-- Step 11: Insert Gemma-3 VLM metadata
INSERT INTO vlm_model_metadata (
  model_name,
  model_version,
  embedding_dimension,
  quantization_type,
  vision_tower_quantization,
  text_tower_quantization,
  training_dataset,
  metadata
) VALUES (
  'gemma-3-2b-it-v',
  '1.0',
  1024,
  'hybrid',
  'int8',
  'nf4',
  'f3',
  '{
    "description": "Gemma-3 2B Vision Language Model with hybrid quantization",
    "vision_tower": "INT8 TensorRT optimized",
    "text_tower": "NF4 LoRA adapters",
    "multimodal_fusion": "FP16",
    "target_domains": ["court_documents", "immigration", "labor", "cps_child_protection"],
    "focus_areas": ["human_trafficking", "forced_labor", "threats", "kidnapping", "abuse"]
  }'
) ON CONFLICT (model_name) DO UPDATE SET
  updated_at = CURRENT_TIMESTAMP;

-- Step 12: Create view for easy access to latest embeddings
CREATE OR REPLACE VIEW latest_document_embeddings AS
SELECT
  d.id,
  d.title,
  d.document_type,
  leo.embedding,
  leo.embedding_vlm,
  leo.modality,
  leo.seals,
  leo.layout_boxes,
  leo.ocr_text,
  leo.confidence,
  d.created_at
FROM legal_documents d
LEFT JOIN legal_embeddings_omni leo ON d.id = leo.document_id
WHERE leo.created_at = (
  SELECT MAX(created_at)
  FROM legal_embeddings_omni
  WHERE document_id = d.id
);

-- Step 13: Create function to update embedding timestamps
CREATE OR REPLACE FUNCTION update_embedding_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 14: Create triggers for timestamp updates
CREATE TRIGGER legal_embeddings_omni_timestamp
BEFORE UPDATE ON legal_embeddings_omni
FOR EACH ROW
EXECUTE FUNCTION update_embedding_timestamp();

CREATE TRIGGER ca_constitution_sections_timestamp
BEFORE UPDATE ON ca_constitution_sections
FOR EACH ROW
EXECUTE FUNCTION update_embedding_timestamp();

-- Step 15: Add comments for documentation
COMMENT ON TABLE legal_embeddings_omni IS 'Multimodal embeddings from Gemma-3 VLM (text + vision + layout)';
COMMENT ON COLUMN legal_embeddings_omni.modality IS 'Type of embedding: text, vision, layout, or multimodal';
COMMENT ON COLUMN legal_embeddings_omni.seals IS 'Detected seals/signatures from YOLO-Seal detector';
COMMENT ON COLUMN legal_embeddings_omni.layout_boxes IS 'Bounding boxes from DocLing layout analysis';
COMMENT ON COLUMN legal_embeddings_omni.ocr_text IS 'Extracted text from OCR (TrOCR or Donut)';

COMMENT ON TABLE ca_constitution_sections IS 'California Constitution sections with embeddings and cross-references';
COMMENT ON COLUMN ca_constitution_sections.authority_weight IS 'PageRank-style authority score for ranking';
COMMENT ON COLUMN ca_constitution_sections.cross_references IS 'Links to related sections, statutes, and case law';

COMMENT ON TABLE document_keywords IS 'Extracted keywords and entities from documents';
COMMENT ON COLUMN document_keywords.extraction_method IS 'Method used: ollama (LLM-based) or fallback (heuristic)';

COMMENT ON TABLE vlm_model_metadata IS 'Metadata about VLM models and their configurations';
COMMENT ON COLUMN vlm_model_metadata.quantization_type IS 'Overall quantization strategy: fp16, int8, nf4, or hybrid';

-- Step 16: Grant permissions (adjust as needed)
GRANT SELECT, INSERT, UPDATE ON legal_embeddings_omni TO legal_admin;
GRANT SELECT, INSERT, UPDATE ON ca_constitution_sections TO legal_admin;
GRANT SELECT, INSERT, UPDATE ON document_keywords TO legal_admin;
GRANT SELECT ON vlm_model_metadata TO legal_admin;
GRANT SELECT ON latest_document_embeddings TO legal_admin;

-- Completion message
SELECT 'Migration complete: VLM 1024-dimensional embeddings and CA Constitution support added' AS status;
