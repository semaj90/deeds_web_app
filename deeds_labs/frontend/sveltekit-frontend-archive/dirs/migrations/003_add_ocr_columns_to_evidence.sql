-- Migration: Add OCR processing columns to evidence table -- Integrates with agentic OCR controller and tensor
processor -- Support for both client-side WebAssembly and server-side processing ALTER TABLE evidence ADD COLUMN IF NOT
EXISTS ocr_text TEXT; ALTER TABLE evidence ADD COLUMN IF NOT EXISTS ocr_confidence REAL; ALTER TABLE evidence ADD COLUMN
IF NOT EXISTS ocr_regions JSONB; ALTER TABLE evidence ADD COLUMN IF NOT EXISTS ocr_embedding vector(384); ALTER TABLE
evidence ADD COLUMN IF NOT EXISTS tensor_processed BOOLEAN DEFAULT FALSE; ALTER TABLE evidence ADD COLUMN IF NOT EXISTS
processing_method VARCHAR(50); -- 'wasm_simd', 'cuda_tensorrt', 'agentic_controller' ALTER TABLE evidence ADD COLUMN IF
NOT EXISTS ocr_metadata JSONB; ALTER TABLE evidence ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP; -- Index for OCR
text search CREATE INDEX IF NOT EXISTS idx_evidence_ocr_text ON evidence USING gin(to_tsvector('english', ocr_text)); --
Index for embedding similarity search CREATE INDEX IF NOT EXISTS idx_evidence_ocr_embedding ON evidence USING ivfflat
(ocr_embedding vector_cosine_ops); -- Index for processing method filtering CREATE INDEX IF NOT EXISTS
idx_evidence_processing_method ON evidence (processing_method); -- Index for OCR regions (JSONB queries) CREATE INDEX IF
NOT EXISTS idx_evidence_ocr_regions ON evidence USING gin (ocr_regions);
