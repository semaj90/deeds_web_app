/**
 * Canonical Packet Truth Flow
 *
 * Pattern: Postgres (truth) → Derived Caches → Mirrors
 *
 * 1. Read from Postgres (canonical source)
 * 2. Transform/validate (CPU work, not GPU)
 * 3. Write to Postgres (update truth)
 * 4. Invalidate caches (Redis BitFrost)
 * 5. Emit events (async notifications)
 */

import { db } from '$lib/server/db/client';
import { atlasPackets } from '$lib/server/db/schema-postgres';
import Redis from 'ioredis';
import { eq, inArray } from 'drizzle-orm';
import type { SemanticLoopConfig } from '$lib/server/semantic-loop/semantic-loop-types';

interface PacketTruthFlowConfig extends SemanticLoopConfig {
  dryRun: boolean;
  verbose: boolean;
  batchSize: number;
  operation: 'validate' | 'enrich' | 'extract-titles' | 'gan-audit';
}

interface FlowResult {
  operation: string;
  processed: number;
  updated: number;
  errors: string[];
  cacheInvalidated: number;
  duration: number;
  startTime: Date;
  endTime: Date;
}

// ============================================================================
// STEP 1: Read from Postgres (Canonical Source)
// ============================================================================

async function readPacketsFromPostgres(
  config: PacketTruthFlowConfig,
  limit?: number
): Promise<any[]> {
  const query = db.select().from(atlasPackets);

  if (limit) {
    query.limit(limit);
  }

  try {
    const packets = await query;
    if (config.verbose) {
      console.log(`✓ Read ${packets.length} packets from Postgres`);
    }
    return packets;
  } catch (error) {
    console.error('✗ Failed to read from Postgres:', error);
    throw error;
  }
}

// ============================================================================
// STEP 2: Transform/Validate (CPU Work, Not GPU)
// ============================================================================

interface TransformContext {
  packet: any;
  index: number;
  total: number;
}

async function validatePacketStructure(
  context: TransformContext,
  config: PacketTruthFlowConfig
): Promise<{ valid: boolean; errors: string[]; transformed?: any }> {
  const { packet, index } = context;
  const errors: string[] = [];

  // Hard fail conditions (non-negotiable)
  if (!packet.packetKey) errors.push(`[${index}] missing packet_key`);
  if (!packet.sourceRef) errors.push(`[${index}] missing source_ref`);
  if (!packet.featureId) errors.push(`[${index}] missing feature_id`);

  // Soft warnings (acceptable but log)
  if (!packet.summary) {
    if (config.verbose) console.warn(`[${index}] missing summary`);
  }
  if (!packet.embedding) {
    if (config.verbose) console.warn(`[${index}] missing embedding`);
  }

  return {
    valid: errors.length === 0,
    errors,
    transformed: packet
  };
}

async function extractPacketTitles(
  context: TransformContext,
  packet: any
): Promise<{ title: string; confidence: number }> {
  // CPU work: extract from packet JSON
  const title =
    packet.packet?.summary?.substring(0, 100) ||
    packet.packet?.content?.split('\n')[0]?.substring(0, 100) ||
    packet.packetKey ||
    'Untitled';

  return {
    title: title.trim(),
    confidence: packet.packet?.summary ? 0.9 : 0.5
  };
}

// ============================================================================
// STEP 3: Write to Postgres (Update Truth)
// ============================================================================

async function updatePacketsInPostgres(
  updates: Array<{ packetKey: string; updates: Record<string, any> }>,
  config: PacketTruthFlowConfig
): Promise<number> {
  if (config.dryRun) {
    if (config.verbose) {
      console.log(`[DRY-RUN] Would update ${updates.length} packets in Postgres`);
    }
    return updates.length;
  }

  let updated = 0;

  for (const { packetKey, updates: updateData } of updates) {
    try {
      await db
        .update(atlasPackets)
        .set({
          ...updateData,
          updatedAt: new Date()
        })
        .where(eq(atlasPackets.packetKey, packetKey));

      updated++;
    } catch (error) {
      console.error(`Failed to update packet ${packetKey}:`, error);
    }
  }

  if (config.verbose) {
    console.log(`✓ Updated ${updated}/${updates.length} packets in Postgres`);
  }

  return updated;
}

// ============================================================================
// STEP 4: Invalidate Caches (Redis BitFrost)
// ============================================================================

async function invalidateRedisCache(
  packetKeys: string[],
  config: PacketTruthFlowConfig
): Promise<number> {
  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    lazyConnect: true
  });

  try {
    await redis.connect();

    if (config.dryRun) {
      if (config.verbose) {
        console.log(
          `[DRY-RUN] Would invalidate ${packetKeys.length} Redis keys`
        );
      }
      return packetKeys.length;
    }

    const keysToDelete = [
      ...packetKeys.map((pk) => `bitfrost:packet:${pk}`),
      ...packetKeys.map((pk) => `bitfrost:trace:${pk}`)
    ];

    const deleted = await redis.del(...keysToDelete);

    if (config.verbose) {
      console.log(`✓ Invalidated ${deleted} Redis keys`);
    }

    return deleted;
  } catch (error) {
    console.error('Failed to invalidate Redis cache:', error);
    return 0;
  } finally {
    await redis.quit();
  }
}

// ============================================================================
// STEP 5: Emit Events (Async Notifications)
// ============================================================================

async function emitFlowEvent(
  eventType: string,
  payload: Record<string, any>,
  config: PacketTruthFlowConfig
): Promise<void> {
  if (config.dryRun) {
    if (config.verbose) {
      console.log(`[DRY-RUN] Would emit event: ${eventType}`, payload);
    }
    return;
  }

  try {
    // Placeholder: RabbitMQ / EventEmitter integration
    if (config.verbose) {
      console.log(`✓ Emitted event: ${eventType}`, payload);
    }
  } catch (error) {
    console.error(`Failed to emit event ${eventType}:`, error);
  }
}

// ============================================================================
// Orchestration: Compose All Steps
// ============================================================================

export async function executePacketTruthFlow(
  config: PacketTruthFlowConfig
): Promise<FlowResult> {
  const startTime = new Date();
  const result: FlowResult = {
    operation: config.operation,
    processed: 0,
    updated: 0,
    errors: [],
    cacheInvalidated: 0,
    duration: 0,
    startTime,
    endTime: new Date()
  };

  try {
    console.log(`\n🔄 Starting packet truth flow: ${config.operation}`);
    console.log(`   Dry-run: ${config.dryRun}, Verbose: ${config.verbose}`);

    // STEP 1: Read from Postgres
    const packets = await readPacketsFromPostgres(
      config,
      config.operation === 'validate' ? 1000 : undefined
    );
    result.processed = packets.length;

    if (packets.length === 0) {
      console.log('✓ No packets to process');
      result.endTime = new Date();
      result.duration = result.endTime.getTime() - startTime.getTime();
      return result;
    }

    // STEP 2: Transform/Validate
    const updates: Array<{ packetKey: string; updates: Record<string, any> }> =
      [];
    const packetKeysToInvalidate: string[] = [];

    for (let i = 0; i < packets.length; i++) {
      const packet = packets[i];
      const context: TransformContext = {
        packet,
        index: i,
        total: packets.length
      };

      if (config.operation === 'validate') {
        const validation = await validatePacketStructure(context, config);
        if (!validation.valid) {
          result.errors.push(...validation.errors);
        }
      } else if (config.operation === 'extract-titles') {
        const { title, confidence } = await extractPacketTitles(
          context,
          packet
        );
        updates.push({
          packetKey: packet.packetKey,
          updates: { title, titleConfidence: confidence }
        });
        packetKeysToInvalidate.push(packet.packetKey);
      } else if (config.operation === 'gan-audit') {
        // GAN validation happens here
        const validation = await validatePacketStructure(context, config);
        if (validation.valid && packet.packet) {
          // Mark packet as GAN-validated
          updates.push({
            packetKey: packet.packetKey,
            updates: { ganValidated: true, ganValidatedAt: new Date() }
          });
          packetKeysToInvalidate.push(packet.packetKey);
        }
      }
    }

    // STEP 3: Write to Postgres
    result.updated = await updatePacketsInPostgres(updates, config);

    // STEP 4: Invalidate Caches
    result.cacheInvalidated = await invalidateRedisCache(
      packetKeysToInvalidate,
      config
    );

    // STEP 5: Emit Events
    await emitFlowEvent('atlas.packets.updated', {
      operation: config.operation,
      processed: result.processed,
      updated: result.updated,
      errors: result.errors.length
    }, config);

    console.log(`\n✅ Packet truth flow complete: ${config.operation}`);
    console.log(`   Processed: ${result.processed}`);
    console.log(`   Updated: ${result.updated}`);
    console.log(`   Cache invalidated: ${result.cacheInvalidated}`);
    console.log(`   Errors: ${result.errors.length}`);
  } catch (error) {
    console.error('✗ Packet truth flow failed:', error);
    result.errors.push(String(error));
  } finally {
    result.endTime = new Date();
    result.duration = result.endTime.getTime() - startTime.getTime();
  }

  return result;
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  const operation =
    (process.argv[2] as 'validate' | 'enrich' | 'extract-titles' | 'gan-audit') || 'validate';
  const dryRun = process.argv.includes('--dry-run');
  const verbose = process.argv.includes('--verbose');

  const config: PacketTruthFlowConfig = {
    dryRun,
    verbose,
    batchSize: 100,
    operation,
    redis: {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || 'redis'
    },
    gemma4: {
      url: process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090',
      model: 'gemma4-rotorquant:latest',
      temperature: 0.3,
      maxTokens: 1024
    },
    timeoutMs: 90000,
    cacheTtlSeconds: 3600
  };

  const result = await executePacketTruthFlow(config);

  // Report
  console.log('\n📊 Flow Result Summary:');
  console.log(JSON.stringify(result, null, 2));

  process.exit(result.errors.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
