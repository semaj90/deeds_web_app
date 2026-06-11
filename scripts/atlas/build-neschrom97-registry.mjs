#!/usr/bin/env node
/**
 * Build NESCHROM97 Card Registry
 *
 * Maps card_id → packet_key → source_ref → feature_id
 * Pure function, no Drizzle/SvelteKit bootstrap, no background clients
 *
 * Usage:
 *   node scripts/atlas/build-neschrom97-registry.mjs [--dry-run] [--verbose]
 *
 * Output:
 *   docs/reports/neschrom97-card-registry.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');

const FLAGS = {
  dryRun: process.argv.includes('--dry-run'),
  verbose: process.argv.includes('--verbose'),
};

// ============================================================================
// PURE FUNCTIONS
// ============================================================================

function loadCardStore(cardDir) {
  const files = fs.readdirSync(cardDir).filter(f => f.endsWith('.json'));
  const cards = [];
  for (const file of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(cardDir, file), 'utf8'));
      cards.push(content);
    } catch (err) {
      console.warn(`[skip] ${file}: ${err.message}`);
    }
  }
  return cards;
}

function loadPacketLedger(ledgerPath) {
  const lines = fs.readFileSync(ledgerPath, 'utf8')
    .split('\n')
    .filter(line => line.trim());

  const packets = [];
  for (const line of lines) {
    try {
      packets.push(JSON.parse(line));
    } catch (err) {
      console.warn(`[skip] packet line: ${err.message}`);
    }
  }
  return packets;
}

/**
 * Heuristic: try to match card.source to packet source_refs
 * card.source is a file path, packet.source_refs is an array of file paths
 */
function findPacketBySourceRef(card, packets) {
  if (!card.source) return null;

  // Normalize source path (convert backslashes to forward slashes)
  const cardSource = card.source
    .replace(/\\/g, '/')
    .toLowerCase();

  // Look for exact or partial match in any packet's source_refs
  for (const packet of packets) {
    if (!Array.isArray(packet.source_refs)) continue;

    for (const ref of packet.source_refs) {
      const normalizedRef = ref
        .replace(/\\/g, '/')
        .toLowerCase();

      // Check for exact match or suffix match (e.g., "lib/foo.ts" matches "...lib/foo.ts")
      if (normalizedRef === cardSource || normalizedRef.endsWith('/' + cardSource)) {
        return packet;
      }
    }
  }

  return null;
}

/**
 * Calculate match confidence (0.0 = unknown, 1.0 = certain)
 */
function calculateConfidence(card, packet) {
  if (!packet) return 0.0;

  let score = 0.5; // base: found a packet

  // Bonus: som_cluster matches
  if (card.som_cluster && packet.som_cluster) {
    const cardCluster = String(card.som_cluster).toLowerCase();
    const packetCluster = String(packet.som_cluster).toLowerCase();
    if (cardCluster === packetCluster) score += 0.25;
  }

  // Bonus: feature_id in packet's feature_ids
  if (packet.feature_id && card.tags?.includes(packet.feature_id)) {
    score += 0.25;
  }

  return Math.min(1.0, score);
}

function buildRegistry(cards, packets) {
  const mappings = [];
  let matched = 0;

  for (const card of cards) {
    const packet = findPacketBySourceRef(card, packets);
    const confidence = calculateConfidence(card, packet);

    if (packet) matched++;

    mappings.push({
      card_id: card.id,
      source: card.source,
      tags: card.tags || [],
      som_cluster: card.som_cluster,
      packet_id: packet?.packet_id || null,
      packet_key: null, // TBD: derive from packet_id once Postgres schema is finalized
      feature_id: packet?.feature_id || null,
      source_refs: packet?.source_refs || [],
      route: packet?.route || null,
      reward: packet?.reward || null,
      latency_ms: packet?.latency_ms || null,
      cache_hit: packet?.cache_hit || null,
      match_confidence: confidence,
    });
  }

  return { mappings, matched, total: cards.length };
}

function generateRegistry(mappings, matched, total, timestamp) {
  return {
    metadata: {
      generated_at: timestamp,
      generated_by: 'build-neschrom97-registry.mjs',
      card_store_size: total,
      packet_ledger_size: 45,
      mapped_count: matched,
      mapped_percentage: total > 0 ? ((matched / total) * 100).toFixed(1) : '0.0',
      unmapped_count: total - matched,
    },
    mappings,
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const timestamp = new Date().toISOString();
  const cardDir = path.join(PROJECT_ROOT, 'neschrom97/cards');
  const ledgerPath = path.join(PROJECT_ROOT, 'memory/packets/nes-chrom-packets.jsonl');
  const outputPath = path.join(PROJECT_ROOT, 'docs/reports/neschrom97-card-registry.json');

  // Verify inputs exist
  if (!fs.existsSync(cardDir)) {
    console.error(`[error] Card store not found: ${cardDir}`);
    process.exit(1);
  }
  if (!fs.existsSync(ledgerPath)) {
    console.error(`[error] Packet ledger not found: ${ledgerPath}`);
    process.exit(1);
  }

  console.log(`[load] Reading card store from ${cardDir}...`);
  const cards = loadCardStore(cardDir);
  console.log(`[load] Loaded ${cards.length} cards`);

  console.log(`[load] Reading packet ledger from ${ledgerPath}...`);
  const packets = loadPacketLedger(ledgerPath);
  console.log(`[load] Loaded ${packets.length} packets`);

  console.log(`[build] Building registry...`);
  const { mappings, matched, total } = buildRegistry(cards, packets);
  console.log(`[build] Matched ${matched}/${total} cards (${((matched/total)*100).toFixed(1)}%)`);

  const registry = generateRegistry(mappings, matched, total, timestamp);

  if (FLAGS.verbose) {
    console.log('\n[sample] First 3 mappings:');
    for (const m of mappings.slice(0, 3)) {
      console.log(JSON.stringify(m, null, 2));
    }
  }

  if (FLAGS.dryRun) {
    console.log(`\n[dry-run] Would write ${registry.mappings.length} mappings to ${outputPath}`);
    console.log(JSON.stringify(registry.metadata, null, 2));
  } else {
    fs.writeFileSync(outputPath, JSON.stringify(registry, null, 2));
    console.log(`\n[write] Registry written to ${outputPath}`);
    const bytes = fs.statSync(outputPath).size;
    const mb = (bytes / 1024 / 1024).toFixed(2);
    console.log(`[size] ${bytes} bytes (${mb} MB)`);
  }

  // Summary
  console.log(`\n[summary]`);
  console.log(`  Cards loaded: ${cards.length}`);
  console.log(`  Packets loaded: ${packets.length}`);
  console.log(`  Matched: ${matched} (${((matched/total)*100).toFixed(1)}%)`);
  console.log(`  Unmapped: ${total - matched}`);
  console.log(`\n[next] After verification, run:`);
  console.log(`  npm run smoke:neschrom97-registry`);
}

main().catch(err => {
  console.error('[error]', err.message);
  process.exit(1);
});
