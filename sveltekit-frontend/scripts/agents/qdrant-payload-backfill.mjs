#!/usr/bin/env node
/**
 * feat(agents): backfill Qdrant chunks with directory-card metadata
 * 
 * Attaches AgentsDirectoryCard signals to Qdrant points in codebase_chunks_768.
 * This allows the retrieval engine to see high-level context (feature keys, activity scores,
 * directory summaries) attached to individual code chunks.
 *
 * Usage:
 *   npm run agents:qdrant:backfill -- --dry-run --limit 100
 *   npm run agents:qdrant:backfill -- --limit 1000
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';
const GRAPH_PATH = 'docs/graph/codebase-graph.json';
const BATCH_SIZE = 100;

const args = process.argv.slice(2);
const FLAGS = {
    dryRun: args.includes('--dry-run') || args.length === 0, // Default to dry-run
    limit: parseLimit(args),
    force: args.includes('--force'),
    quiet: args.includes('--quiet')
};

function parseLimit(argv) {
    const eqArg = argv.find(a => a.startsWith('--limit='));
    if (eqArg) return parseInt(eqArg.slice(8), 10);
    const idx = argv.indexOf('--limit');
    if (idx >= 0 && argv[idx+1]) return parseInt(argv[idx+1], 10);
    return Infinity;
}

const log = (...args) => { if (!FLAGS.quiet) console.log(...args); };

async function main() {
    log('=== Qdrant Agents Card Backfill ===');
    log(`[cfg] dryRun=${FLAGS.dryRun} limit=${FLAGS.limit} force=${FLAGS.force}`);

    if (!fs.existsSync(GRAPH_PATH)) {
        console.error(`Graph not found: ${GRAPH_PATH}. Run 'npm run graphify' first.`);
        process.exit(1);
    }

    // 1. Load directory cards from graph
    const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf-8'));
    const allDirs = graph.directories ?? [];
    log(`[graph] Loaded ${allDirs.length} directories`);

    // Build a map of dirPath -> card metadata
    const dirMap = new Map();
    for (const dirData of allDirs) {
        const dirPath = dirData.dir;
        const card = buildCard(dirPath, dirData, graph);
        dirMap.set(dirPath, card);
    }

    // Sort dirs by length descending so we can match the longest prefix (most specific dir)
    const sortedDirPaths = Array.from(dirMap.keys()).sort((a, b) => b.length - a.length);

    // 2. Scroll Qdrant and patch payloads
    let offset = null;
    let totalScanned = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    log(`[qdrant] Scrolling ${COLLECTION}...`);

    while (totalScanned < FLAGS.limit) {
        const scrollLimit = Math.min(BATCH_SIZE, FLAGS.limit - totalScanned);
        const scrollRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                limit: scrollLimit,
                offset: offset,
                with_payload: true,
                with_vector: false
            })
        });

        if (!scrollRes.ok) {
            console.error(`[error] Qdrant scroll failed: ${scrollRes.status} ${await scrollRes.text()}`);
            break;
        }

        const data = await scrollRes.json();
        const points = data.result?.points ?? [];
        if (points.length === 0) break;

        offset = data.result?.next_page_offset;
        
        const patches = [];

        for (const pt of points) {
            totalScanned++;
            const filePath = pt.payload?.file_path || pt.payload?.relativePath || '';
            const normalizedPath = filePath.replace(/\\/g, '/');

            // Find matching directory card (longest prefix)
            const dirPath = sortedDirPaths.find(p => normalizedPath.startsWith(p));
            if (!dirPath) {
                totalSkipped++;
                continue;
            }

            const card = dirMap.get(dirPath);
            const cardId = card.id;
            const cardHash = card.contentHash;

            // Skip if already matched and not forced
            if (!FLAGS.force && pt.payload?.agents_card_id === cardId && pt.payload?.agents_card_hash === cardHash) {
                totalSkipped++;
                continue;
            }

            // Prepare payload patch
            const payload = {
                agents_card_id: cardId,
                agents_card_hash: cardHash,
                dir_path: card.dirPath,
                dir_summary: card.summary,
                feature_keys: card.featureKeys,
                qdrant_tags: card.qdrantTags,
                audit_status: card.auditStatus,
                agents_activity_score: card.activityScore,
                agents_indexed_at: card.lastIndexedAt
            };

            patches.push({ id: pt.id, payload });
        }

        if (patches.length > 0) {
            if (!FLAGS.dryRun) {
                // Group by dir card ID — Qdrant set_payload applies one payload to all listed points,
                // so each group gets its own batch call.
                const groups = new Map();
                for (const p of patches) {
                    const key = p.payload.agents_card_id;
                    if (!groups.has(key)) groups.set(key, { payload: p.payload, ids: [] });
                    groups.get(key).ids.push(p.id);
                }

                for (const [key, group] of groups.entries()) {
                    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            points: group.ids,
                            payload: group.payload
                        })
                    });
                    if (res.ok) {
                        totalUpdated += group.ids.length;
                    } else {
                        totalFailed += group.ids.length;
                        console.error(`[warn] Failed to patch ${group.ids.length} points for ${key}`);
                    }
                }
            } else {
                totalUpdated += patches.length;
            }
        }

        log(`  scanned=${totalScanned} updated=${totalUpdated} skipped=${totalSkipped}${FLAGS.dryRun ? ' [DRY]' : ''}`);

        if (!offset) break;
    }

    log(`\nFinal Summary:`);
    log(`- Scanned: ${totalScanned}`);
    log(`- Updated: ${totalUpdated}`);
    log(`- Skipped: ${totalSkipped}`);
    log(`- Failed:  ${totalFailed}`);
    
    const machineSummary = {
        dryRun: FLAGS.dryRun,
        limit: FLAGS.limit === Infinity ? null : FLAGS.limit,
        processed: totalScanned,
        redisWrites: 0,
        couchWrites: 0,
        qdrantWrites: FLAGS.dryRun ? 0 : totalUpdated,
        markdownWrites: 0,
        neo4jWrites: 0
    };
    console.log(`[agents:qdrant:backfill] summary=${JSON.stringify(machineSummary)}`);

    if (FLAGS.dryRun && machineSummary.qdrantWrites > 0) {
        console.error(`[FATAL] Dry-run violation in Qdrant backfill!`);
        process.exit(2);
    }
}

function buildCard(dirPath, dirData, graph) {
    const slug = dirPath.replace(/[\\/]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
    const id = `agents:dir:${slug || 'root'}`;
    
    // Derive gates (simplified from build-agents-index.mjs logic)
    const card = {
        id,
        dirPath,
        title: path.basename(dirPath) || 'root',
        summary: dirData.summary ?? '',
        featureKeys: dirData.featureKeys ?? [],
        qdrantTags: dirData.tagList ?? [],
        auditStatus: dirData.shipped ? 'SHIPPED' : (dirData.lines > 0 ? 'PARTIAL' : 'SPEC_ONLY'),
        activityScore: dirData.activityScore ?? 0,
        lastIndexedAt: new Date().toISOString(),
    };

    card.contentHash = computeCardContentHash(card);
    return card;
}

function computeCardContentHash(card) {
    const payload = JSON.stringify({
        dirPath:        card.dirPath,
        summary:        card.summary ?? '',
        featureKeys:    [...(card.featureKeys ?? [])].sort(),
        qdrantTags:     [...(card.qdrantTags ?? [])].sort(),
        auditStatus:    card.auditStatus ?? 'SPEC_ONLY',
        activityScore:  card.activityScore ?? 0
    });
    return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
