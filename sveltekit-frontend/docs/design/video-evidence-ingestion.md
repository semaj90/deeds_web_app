# Design: Video Evidence Ingestion Pipeline (V1)

This document outlines the architecture for the multi-modal evidence ingestion pipeline, specifically focused on the V1 implementation: transcript-first video ingestion.

## Core Philosophy
- **Postgres as Truth**: Source of truth for audit, metadata, and relations.
- **SeaweedFS for Blobs**: Video files, audio clips, and frames are stored in S3-compatible storage.
- **Qdrant for Search**: Primary semantic index for transcript chunks and visual captions.
- **Neo4j for Reasoning**: GraphRAG layer connecting evidence to entities, events, and cases.
- **Fail-Safe Ingestion**: Durable job tracking in Postgres to handle long-running media tasks.

## Ingestion Workflow (V1)

1. **Registration**: Operator submits a local file or a URL.
2. **Persistence**: A row is created in `evidence_items` (status: `queued`).
3. **Blob Storage**: Original file is uploaded to SeaweedFS.
4. **Media Extraction**: FFmpeg extracts audio (WAV) from the video.
5. **Transcription**: Whisper/Faster-Whisper processes the audio to produce a timestamped transcript.
6. **Segmentation**: Transcript is split into logical timestamped chunks (e.g., 30s segments).
7. **Embedding**: Segments are embedded and upserted into Qdrant (`evidence_text_chunks`).
8. **Graph Linkage**: Evidence and segments are linked in Neo4j.
9. **Summarization**: Gemma4 summarizes the entire transcript for a "Wiki Note" in CouchDB.

## Database Schema (Postgres)

### `evidence_items`
- `id`: UUID (PK)
- `case_id`: UUID (FK to cases)
- `modality`: `video` | `audio` | `image` | `document`
- `source_url`: Text (optional)
- `storage_uri`: Text (SeaweedFS path)
- `status`: `queued` | `processing` | `completed` | `failed`
- `sha256`: Text (integrity)
- `metadata`: JSONB
- `created_at`: Timestamp

### `evidence_media_assets`
Tracks derived files like extracted audio or keyframes.
- `id`: UUID (PK)
- `evidence_id`: UUID (FK)
- `asset_type`: `original` | `audio_mono` | `frame`
- `storage_uri`: Text
- `mime_type`: Text
- `metadata`: JSONB

### `evidence_transcript_segments`
- `id`: UUID (PK)
- `evidence_id`: UUID (FK)
- `start_ms`: Integer
- `end_ms`: Integer
- `text`: Text
- `confidence`: Numeric
- `model`: Text
- `metadata_json`: JSONB

### `evidence_processing_jobs`
- `id`: UUID (PK)
- `evidence_id`: UUID (FK)
- `status`: Text
- `progress`: Numeric
- `error`: Text
- `updated_at`: Timestamp

## Ingestion Workflow (V2: Visual Lane)

After the V1 transcript pipeline completes (or in parallel):
1. **Keyframe Extraction**: FFmpeg extracts frames every 10 seconds (`fps=1/10`).
2. **Persistence**: Frame metadata is stored in `evidence_frames`.
3. **Blob Storage**: Frame images are uploaded to SeaweedFS.
4. **VLM Captioning**: Gemma4 VLM analyzes each frame to produce a caption, objects list, and scene description.
5. **OCR Extraction**: Any visible text in the frame is extracted.
6. **Visual Embedding**: Frame captions are embedded and upserted into Qdrant (`evidence_visual_chunks`).
7. **Graph Linkage**: `(:Evidence)-[:HAS_FRAME]->(:Frame)` and `(:Frame)-[:DEPICTS]->(:Entity)` edges are created in Neo4j.

## Database Schema (Postgres) - V2 Additions

### `evidence_frames` (Already defined in V1 schema)
- `id`: UUID (PK)
- `evidence_id`: UUID (FK)
- `timestamp_ms`: Integer
- `storage_uri`: Text
- `caption`: Text
- `objects_json`: JSONB
- `ocr_text`: Text
- `tags_json`: JSONB
- `vlm_model`: Text
- `confidence`: Numeric
- `created_at`: Timestamp

## Qdrant Payload (Collection: `evidence_text_chunks`)
```json
{
  "evidence_id": "uuid",
  "case_id": "uuid",
  "modality": "video",
  "view": "transcript_segment",
  "start_ms": 0,
  "end_ms": 30000,
  "text": "...",
  "source_uri": "s3://...",
  "trust_tier": "transcript_candidate"
}
```
