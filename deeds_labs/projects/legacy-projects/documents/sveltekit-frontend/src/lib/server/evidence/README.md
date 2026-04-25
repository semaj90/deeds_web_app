Simple evidence pipeline scaffold (Node + RabbitMQ)

Purpose: lightweight scaffold to accept uploaded evidence, publish OCR jobs to RabbitMQ, and run two simple consumers (OCR -> Embedding).

Layout:
- rabbitmq.ts - helper to connect/publish/consume
- services/ocr.ts - wrapper for Tesseract or fallback
- services/embedding.ts - wrapper for transformers or fallback
- services/entity-extractor.ts - NER wrapper or fallback
- services/forensics.ts - heuristic detectors
- worker-ocr.ts - consumer that runs OCR and publishes to embed queue
- worker-embed.ts - consumer that computes embeddings and persists (Drizzle stub)

Notes:
- This scaffold uses AMQP (amqplib). It intentionally keeps heavy deps optional and falls back to no-op behavior when they are not installed.
- Environment variables: RABBITMQ_URL (amqp://localhost), EVIDENCE_UPLOAD_PATH (./uploads)
