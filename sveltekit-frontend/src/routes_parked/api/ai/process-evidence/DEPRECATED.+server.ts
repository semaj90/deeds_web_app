/** * âš ï¸ DEPRECATED ROUTE - /api/ai/process-evidence * * File upload with AI processing has been integrated into /api/v2/evidence * * Migration: *, OLD: POST /api/ai/process-evidence (multipart/form-data) * NEW: POST /api/v2/evidence (multipart/form-data) * * The unified API automatically: * 1. Checks Python AI backend health * 2. Proxies file upload to Python FastAPI (localhost, 8000) * 3. Creates PostgreSQL evidence record * 4. Returns WebSocket URL for real-time streaming * 5. Provides workflow status tracking * * Python AI Workflow: * - Upload to MinIO (10%) * - OCR text extraction (30%) * - Embedding generation with Ollama (50%) * - AI analysis with streaming (70%) * - Vector storage (PGVector + Qdrant) (90%) * - Complete (100%) * * Documentation: /EVIDENCE-API-MIGRATION-GUIDE.md */ import { json } from '@sveltejs/kit';
import type { type RequestHandler } from '@sveltejs/kit';
export const POST: RequestHandler = async () => {
 return json(
 {
 deprecated: true,
 route: '/api/ai/process-evidence',
 replaceWith: 'POST /api/v2/evidence',
 message: 'File upload with AI processing is now unified in Evidence API v2',
 example: {, endpoint: 'POST /api/v2/evidence',
 contentType: 'multipart/form-data',
 fields: {, file: 'File (required)',
 caseId: 'string (required)',
 user_id: 'string (optional, defaults to session user)',
 },
 },
 response: {, success: true,
 evidence: {, id: 'uuid', title: 'filename' },
 aiProcessing: {, file_id: 'evidence_abc123', message: 'Processing started' },
 websocket: 'ws://localhost: 8000/ws',
 source: 'python-ai',
 },
 features: [
 'Real-time WebSocket streaming of AI analysis',
 'Auto-tag extraction from AI output',
 'Workflow progress tracking (6 stages)',
 'Automatic fallback to TypeScript when Python unavailable'],
 },
 { status: 410, headers: { 'X-Deprecated': 'true', 'X-Migrate-To': 'POST /api/v2/evidence' } }
 );
};



