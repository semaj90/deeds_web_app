/**
 * summary-freshness-checker.ts — Skip or regenerate summaries based on content_hash
 *
 * Avoids re-summarizing unchanged packets. Tracks:
 * - content_hash: SHA256 of file/chunk content
 * - summary_hash: SHA256 of generated summary
 * - last_summary_at: timestamp of last summarization
 * - summary_freshness: boolean (true if content unchanged since summary)
 */

import crypto from 'crypto';
import { db } from '$lib/server/db/client.js';
import { atlasPackets } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';
import { getRedis } from '$lib/server/redis.js';

export interface SummaryFreshnessCheck {
  packet_key: string;
  is_fresh: boolean;
  reason: 'unchanged_content' | 'stale' | 'missing_hash' | 'first_summary';
  content_hash: string;
  last_summary_at?: string;
  should_regenerate: boolean;
}

/**
 * Compute SHA256 hash of content (file content or chunk text)
 */
export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Compute SHA256 hash of summary text (to detect accidental changes)
 */
export function computeSummaryHash(summary: string): string {
  return crypto.createHash('sha256').update(summary).digest('hex');
}

/**
 * Check if a packet's summary is still fresh (content unchanged).
 * Returns early if Redis cache is available.
 */
export async function checkSummaryFreshness(
  packetKey: string,
  contentHash: string
): Promise<SummaryFreshnessCheck> {
  // Try Redis cache first
  try {
    const redis = getRedis();
    const cached = await redis.get(`summary:freshness:${packetKey}`);
    if (cached) {
      const parsed = JSON.parse(cached) as SummaryFreshnessCheck;
      if (parsed.content_hash === contentHash) {
        return { ...parsed, is_fresh: true, reason: 'unchanged_content' };
      }
    }
  } catch {
    /* Redis unavailable, fall through to DB */
  }

  // Query Postgres for packet summary metadata
  try {
    const packet = await db
      .select()
      .from(atlasPackets)
      .where(eq(atlasPackets.packet_key, packetKey))
      .limit(1);

    if (!packet || packet.length === 0) {
      return {
        packet_key: packetKey,
        is_fresh: false,
        reason: 'missing_hash',
        content_hash: contentHash,
        should_regenerate: true,
      };
    }

    const p = packet[0];
    const storedContentHash = (p.metadata as Record<string, unknown>)?.content_hash as
      | string
      | undefined;

    if (!storedContentHash) {
      return {
        packet_key: packetKey,
        is_fresh: false,
        reason: 'missing_hash',
        content_hash: contentHash,
        should_regenerate: true,
      };
    }

    const isFresh = storedContentHash === contentHash;
    const lastSummaryAt = (p.metadata as Record<string, unknown>)?.last_summary_at as
      | string
      | undefined;

    const result: SummaryFreshnessCheck = {
      packet_key: packetKey,
      is_fresh: isFresh,
      reason: isFresh ? 'unchanged_content' : 'stale',
      content_hash: contentHash,
      last_summary_at: lastSummaryAt,
      should_regenerate: !isFresh,
    };

    // Cache in Redis (1 hour)
    try {
      const redis = getRedis();
      await redis.setex(`summary:freshness:${packetKey}`, 3600, JSON.stringify(result));
    } catch {
      /* Redis unavailable, continue */
    }

    return result;
  } catch (err) {
    console.error(`[summary-freshness-checker] Failed to check freshness for ${packetKey}:`, err);
    // On error, assume stale (regenerate to be safe)
    return {
      packet_key: packetKey,
      is_fresh: false,
      reason: 'missing_hash',
      content_hash: contentHash,
      should_regenerate: true,
    };
  }
}

/**
 * Record that a summary was generated for this packet.
 * Updates Postgres metadata with content_hash, summary_hash, and timestamp.
 */
export async function recordSummaryGeneration(
  packetKey: string,
  summary: string,
  contentHash: string
): Promise<boolean> {
  try {
    const summaryHash = computeSummaryHash(summary);

    // Update Postgres metadata
    await db
      .update(atlasPackets)
      .set({
        metadata: {
          content_hash: contentHash,
          summary_hash: summaryHash,
          last_summary_at: new Date().toISOString(),
        },
        updated_at: new Date(),
      })
      .where(eq(atlasPackets.packet_key, packetKey));

    // Invalidate Redis cache
    try {
      const redis = getRedis();
      await redis.del(`summary:freshness:${packetKey}`);
    } catch {
      /* Redis unavailable */
    }

    return true;
  } catch (err) {
    console.error(`[summary-freshness-checker] Failed to record summary for ${packetKey}:`, err);
    return false;
  }
}

/**
 * Batch check freshness for multiple packets.
 * Returns packets that need regeneration.
 */
export async function batchCheckFreshness(
  packets: Array<{ packet_key: string; content: string }>
): Promise<SummaryFreshnessCheck[]> {
  const results: SummaryFreshnessCheck[] = [];

  for (const p of packets) {
    const contentHash = computeContentHash(p.content);
    const freshness = await checkSummaryFreshness(p.packet_key, contentHash);
    results.push(freshness);
  }

  return results;
}

/**
 * Get statistics on summary freshness across a batch.
 */
export async function summarizeFreshnessStats(
  checks: SummaryFreshnessCheck[]
): Promise<{
  total: number;
  fresh: number;
  stale: number;
  missing: number;
  fresh_percent: number;
  regenerate_count: number;
}> {
  const fresh = checks.filter((c) => c.is_fresh).length;
  const stale = checks.filter((c) => c.reason === 'stale').length;
  const missing = checks.filter((c) => c.reason === 'missing_hash').length;
  const regenerate = checks.filter((c) => c.should_regenerate).length;

  return {
    total: checks.length,
    fresh,
    stale,
    missing,
    fresh_percent: checks.length > 0 ? Math.round((fresh / checks.length) * 100) : 0,
    regenerate_count: regenerate,
  };
}
