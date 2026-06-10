import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');
const RECS_JSON = path.join(ROOT, '.opencode', 'recommendations', 'recommendations.json');
const RECS_MD = path.join(ROOT, '.opencode', 'recommendations', 'recommendations.md');

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

/**
 * Merges self-healing recommendations into OpenCode recommendations files.
 */
export async function mergeSelfHealRecommendations(newRecs) {
	console.log(`[self-heal] Merging ${newRecs.length} recommendations...`);

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
