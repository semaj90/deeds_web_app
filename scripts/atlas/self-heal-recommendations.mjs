import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');
const RECS_JSON = path.join(ROOT, '.opencode', 'recommendations', 'recommendations.json');
const RECS_MD = path.join(ROOT, '.opencode', 'recommendations', 'recommendations.md');

// Load environment config
function loadEnv(filePath) {
  const env = {};
  if (!existsSync(filePath)) return env;
  try {
    const content = crypto.createHash ? fs.readFileSync(filePath, 'utf8') : ''; // fallback in case sync isn't permitted but here we are in ESM node script
  } catch {}
  return env;
}

// Simple sync reader helper for env loaders in ESM
import { readFileSync } from 'node:fs';
function loadEnvSync(filePath) {
  if (!existsSync(filePath)) return {};
  const env = {};
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = {
  ...loadEnvSync(path.join(ROOT, '.env')),
  ...loadEnvSync(path.join(ROOT, 'sveltekit-frontend', '.env')),
  ...process.env,
};

const DATABASE_URL = env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const SINK = env.SELF_HEAL_SINK || 'both'; // 'opencode', 'nes_chrom', or 'both'

function buildMarkdown(output) {
	const { generatedAt, totalCount, clusters, top10 } = output;
	const lines = [
		`# Recommendations — ${generatedAt}`,
		``,
		`**Total**: ${totalCount} recommendations across ${Object.keys(clusters).length} clusters`,
		``,
		`## Top 10`,
		...top10.map(
			(r, i) =>
				`${i + 1}. **[${r.priority.toUpperCase()}]** \`${r.type}\` — ${r.title}\n   - ${r.why}\n   - Action: ${r.action}${r.next_command ? `\n   - \`${r.next_command}\`` : ''}`
		),
		``,
		`## By Cluster`,
		...Object.entries(clusters).map(([cluster, recs]) =>
			[`### ${cluster}`, ...recs.map((r) => `- [${r.priority}] ${r.title}`), ''].join('\n')
		)
	];
	return lines.join('\n');
}

function sha8(str) {
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 8);
}

async function writeNesChromPackets(newRecs) {
  console.log(`[self-heal] Writing ${newRecs.length} self-healing recommendations to nes_chrom_packets database...`);
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    for (const rec of newRecs) {
      const route = rec.route || '/api/sse/chat';
      const type = rec.type || 'retrieval:general';
      const sourceRefs = rec.sourceRefs || [];
      const sourceRef = sourceRefs[0] || 'unknown';

      // Hash-based unique packet key
      const packetKey = `selfheal:${sha8(route + type + sourceRef)}`;
      const queryHash = crypto.createHash('sha256').update(packetKey).digest('hex');
      const chunkId = type;
      const featureId = 'feat:self_heal';
      const packetType = 'nes_chrom_self_heal';
      const lane = 'self_heal_retrieval';

      await pool.query(`
        INSERT INTO nes_chrom_packets (
          packet_key,
          query_hash,
          chunk_id,
          source_ref,
          source_refs,
          feature_id,
          packet_type,
          lane,
          payload,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, NOW()
        )
        ON CONFLICT (packet_key) DO UPDATE SET
          payload = EXCLUDED.payload,
          updated_at = NOW()
      `, [
        packetKey,
        queryHash,
        chunkId,
        sourceRef,
        JSON.stringify(sourceRefs),
        featureId,
        packetType,
        lane,
        JSON.stringify(rec)
      ]);
      console.log(`  - Upserted packet: ${packetKey} ("${rec.title}")`);
    }
  } catch (err) {
    console.error('❌ Error writing to nes_chrom_packets:', err);
  } finally {
    await pool.end();
  }
}

async function writeOpenCodeRecommendations(newRecs) {
	console.log(`[self-heal] Merging ${newRecs.length} recommendations to OpenCode...`);

	let existing = {
		generatedAt: new Date().toISOString(),
		totalCount: 0,
		clusters: {},
		top10: [],
		inputs: {}
	};
	if (existsSync(RECS_JSON)) {
		try {
			const data = await fs.readFile(RECS_JSON, 'utf8');
			existing = JSON.parse(data);
		} catch {
			// corrupt or missing — start fresh
		}
	}

	if (!existing || typeof existing !== 'object') {
		existing = {};
	}
	if (!existing.clusters) {
		existing.clusters = {};
	}

	// Update the "Self-Healing Retrieval" cluster
	existing.clusters['Self-Healing Retrieval'] = newRecs;

	// Recompute totals and sort by priority order
	const allRecs = Object.values(existing.clusters).flat();
	const order = { high: 0, medium: 1, low: 2 };
	allRecs.sort((a, b) => (order[a.priority] ?? 2) - (order[b.priority] ?? 2));

	existing.generatedAt = new Date().toISOString();
	existing.totalCount = allRecs.length;
	existing.top10 = allRecs.slice(0, 10);

	await fs.mkdir(path.dirname(RECS_JSON), { recursive: true });
	await fs.writeFile(RECS_JSON, JSON.stringify(existing, null, 2), 'utf8');
	await fs.writeFile(RECS_MD, buildMarkdown(existing), 'utf8');

	console.log(`[self-heal] ✓ Total recommendations across all clusters: ${allRecs.length}`);
	console.log(`[self-heal] ✓ Updated ${RECS_JSON} and ${RECS_MD}`);
}

/**
 * Merges self-healing recommendations into target sinks (Postgres and/or OpenCode).
 */
export async function mergeSelfHealRecommendations(newRecs) {
  console.log(`[self-heal] Processing ${newRecs.length} recommendations. SINK=${SINK}`);

  if (SINK === 'opencode' || SINK === 'both') {
    await writeOpenCodeRecommendations(newRecs);
  }
  if (SINK === 'nes_chrom' || SINK === 'both') {
    await writeNesChromPackets(newRecs);
  }
}
