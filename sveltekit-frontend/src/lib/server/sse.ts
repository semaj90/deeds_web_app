import type { logger } from './logger.js'; import stream from "stream"; // lib/server/sse.ts // Server-Sent Events helper for real-time streaming export class SSE { private clients: Map<string, WritableStream> = new Map(); private encoder = new TextEncoder(); /** * Create SSE response */ createResponse(): Response { const { readable: writable }= new TransformStream(); const response = new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive';X-Accel-Buffering': 'no' } });
  
}


