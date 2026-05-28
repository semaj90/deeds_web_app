import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

// Output trace path
const CWD = process.cwd();
const RETRIEVAL_LOG_PATH = path.join(CWD, '.tmp', 'atlas-retrieval-loop.jsonl');

export interface PromptListenerOptions {
  redisUrl?: string;
  qdrantUrl?: string;
  postgresUrl?: string;
  fallbackReason?: string;
}

export interface RetrievalResult {
  query: string;
  selectedCards: string[];
  droppedCards: string[];
  sourceRefs: string[];
  latencyMs: number;
  fallbackReason: string | null;
  missingNotes: string | null;
}

export async function promptRetrieve(
  query: string,
  opts: PromptListenerOptions = {}
): Promise<{ acePacket: string; trace: RetrievalResult }> {
  const startTime = Date.now();
  const queryHash = createHash('sha256').update(query).digest('hex');
  const redisKey = `ace:ctx:${queryHash}`;

  let cachedPacket: string | null = null;
  let fallbackReason: string | null = null;
  const selectedCards: string[] = [];
  const droppedCards: string[] = [];
  const sourceRefs: string[] = [];

  try {
    // 1. Redis exact cache lookup
    console.log(`[PromptListener] Redis lookup for key: ${redisKey}`);
    // (Simulate Redis exact hit check)
    cachedPacket = null; // No hit for testing fallback path
  } catch (err) {
    fallbackReason = 'redis_error';
  }

  if (cachedPacket) {
    const elapsed = Date.now() - startTime;
    const trace: RetrievalResult = {
      query,
      selectedCards: ['cached_packet'],
      droppedCards: [],
      sourceRefs: [],
      latencyMs: elapsed,
      fallbackReason: 'exact_redis_hit',
      missingNotes: null
    };
    await logRetrievalEvent(trace);
    return { acePacket: cachedPacket, trace };
  }

  // 2. Qdrant cosine search fallback simulation
  try {
    console.log(`[PromptListener] Qdrant cosine query: ${query}`);
    // In production this fetches named vector 'content' or 'encoded_64'
    selectedCards.push('schema-indexer:contract');
    sourceRefs.push('scripts/codebase-semantic-indexer.ts#chunk-0');
  } catch (err) {
    fallbackReason = fallbackReason ? `${fallbackReason}+qdrant_error` : 'qdrant_error';
  }

  const elapsed = Date.now() - startTime;
  const trace: RetrievalResult = {
    query,
    selectedCards,
    droppedCards,
    sourceRefs,
    latencyMs: elapsed,
    fallbackReason: fallbackReason || 'qdrant_cosine_fallback',
    missingNotes: 'missing_quic_listener'
  };

  // Build compact ACE context packet from profile card details
  const acePacket = JSON.stringify({
    retrieved_at: new Date().toISOString(),
    query_hash: queryHash,
    selected_cards: selectedCards,
    source_refs: sourceRefs,
    status: 'success'
  });

  await logRetrievalEvent(trace);

  return { acePacket, trace };
}

async function logRetrievalEvent(trace: RetrievalResult) {
  try {
    const dir = path.dirname(RETRIEVAL_LOG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(RETRIEVAL_LOG_PATH, JSON.stringify(trace) + '\n', 'utf8');
  } catch (err) {
    console.error('[PromptListener] Failed to write retrieval trace:', err);
  }
}
