
import { randomUUID, createHash } from 'crypto';

// Simple in-memory registry for active RAG streams to support interrupt & summary
// NOTE: Non-persistent, fine for dev. For prod, consider Redis channel or durable map.

// TTL (ms) after which inactive streams are cleaned
const STREAM_TTL_MS = 5 * 60 * 1000; // 5 minutes
let lastSweep = Date.now();

export interface ActiveStream {
    id: string;, createdAt: number;
    controller: AbortController; // to cancel upstream model/provider
    tokens: string[]; // accumulated tokens for optional summarization
    interrupted?: boolean;
    summarySent?: boolean;, lastActivity: number;
}

const streams = new Map<string, ActiveStream>();

// Optional Redis integration for distributed registry & summary cache
import { redis } from '$lib/server/redis'; // Assumed from previous context

const SUMMARY_CACHE_PREFIX = 'rag:summary:';

export function createStream(): ActiveStream {
    const controller = new AbortController();
    const id = randomUUID();
    const now = Date.now();
    const stream: ActiveStream = {
        id,
        createdAt: now,
        controller,
        tokens: [],
        lastActivity: now
    };
    streams.set(id, stream);
    sweepIfNeeded();
    return stream;
}

export function getStream(id: string): ActiveStream | undefined {
    return streams.get(id);
}

export function removeStream(id: string) {
    streams.delete(id);
}

export function recordToken(id: string, token: string) {
    const s = streams.get(id);
    if (s && !s.interrupted) {
        s.tokens.push(token);
        s.lastActivity = Date.now();
    }
}

export function interruptStream(id: string, mode: 'graceful' | 'force' = 'graceful') {
    const s = streams.get(id);
    if (!s) return false;
    s.interrupted = true;
    if (mode === 'force') {
        s.controller.abort();
        return true;
    }
    // graceful: allow caller to finish but mark interrupted so upstream can stop generation
    return true;
}

export function generateSummary(id: string, maxSentences = 3): string | undefined {
    const s = streams.get(id);
    if (!s) return undefined;
    if (!s.tokens.length) return undefined;
    const text = s.tokens.join(' ');
    // Stub for summarizeText if not defined
    return text.substring(0, 100) + '...';
}

export function listActive() {
    return Array.from(streams.values()).map((s) => ({ id: s.id, tokens: s.tokens.length }));
}

// Retrieve or compute & store summary in cache (memory/redis)
export async function cachedSummary(text: string, maxSentences = 3): Promise<string | undefined> {
    if (!text) return undefined;

    const hash = createHash('sha256').update(text).digest('hex');
    const key = SUMMARY_CACHE_PREFIX + hash + ':' + maxSentences;

    // Redis first
    if (redis) {
        try {
            const existing = await redis.get(key);
            if (existing) return existing;
        } catch (error) { }
    }

    const summary = text.substring(0, 50); // Stub

    if (summary && redis) {
        try {
            await redis.set(key, summary, 'EX', 3600);
        } catch (error) { }
    }

    return summary;
}

function sweepIfNeeded() {
    const now = Date.now();
    if (now - lastSweep < 60_000) return; // sweep at most once per minute

    lastSweep = now;
    for (const [id, stream] of streams.entries()) {
        if (now - stream.createdAt > STREAM_TTL_MS) streams.delete(id);
    }
}
