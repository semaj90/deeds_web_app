/**
 * parseQdrantJsonResponse
 *
 * Utility to parse Qdrant JSON responses with simdjson optimization for large payloads.
 * Includes fallback to JSON.parse and detailed tracing metrics.
 */
import { fastJsonParse, isSimdJsonAvailable } from '../gpu/simdjson-bridge.js';

export interface QdrantParserTrace {
  parser: 'simdjson' | 'json.parse';
  responseBytes: number;
  qdrantOperation: 'search' | 'scroll' | 'upsert' | 'collection' | 'unknown';
}

export async function parseQdrantJsonResponse<T = any>(
  response: Response,
  context: {
    qdrantOperation?: QdrantParserTrace['qdrantOperation'];
    onTrace?: (trace: QdrantParserTrace) => void;
  } = {}
): Promise<T> {
  const text = await response.text();
  const bytes = Buffer.byteLength(text, 'utf8');
  const op = context.qdrantOperation ?? 'unknown';

  let parser: QdrantParserTrace['parser'] = 'json.parse';
  let parsed: T;

  if (bytes >= 5000 && isSimdJsonAvailable()) {
    try {
      parsed = fastJsonParse<T>(text);
      parser = 'simdjson';
    } catch (err) {
      // Fallback
      parsed = JSON.parse(text) as T;
    }
  } else {
    parsed = JSON.parse(text) as T;
  }

  if (context.onTrace) {
    context.onTrace({
      parser,
      responseBytes: bytes,
      qdrantOperation: op
    });
  }

  return parsed;
}
