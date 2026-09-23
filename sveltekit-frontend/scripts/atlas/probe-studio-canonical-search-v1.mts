// Read-only probe: the Studio read model against live Postgres must report the canonical corpus and label its search hits CANONICAL_POSTGRES.
import 'dotenv/config';
import { Pool } from 'pg';
import { buildDocIntelligenceStudioSnapshotV1, searchDocCorpus } from '../../src/lib/server/atlas/docs/doc-intelligence-read-model.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
try {
	const snap = await buildDocIntelligenceStudioSnapshotV1({ pool });
	const out: Record<string, unknown> = { canonicalCorpus: { authority: snap.canonicalCorpus.authority, status: snap.canonicalCorpus.status, pageCount: snap.canonicalCorpus.pageCount, chunkCount: snap.canonicalCorpus.chunkCount } };
	const searches: unknown[] = [];
	for (const q of ['hnsw.iterative_scan', 'io_method', 'uuidv7']) {
		const r = await searchDocCorpus({ pool, root: process.cwd().replace(/[\\/]sveltekit-frontend$/, ''), q, limit: 5 });
		const hits = (r as unknown as { hits: { badge: string }[] }).hits;
		const byBadge: Record<string, number> = {};
		for (const h of hits) byBadge[h.badge] = (byBadge[h.badge] ?? 0) + 1;
		searches.push({ q, hits: hits.length, byBadge, first: hits[0] });
	}
	out.searches = searches;
	console.log(JSON.stringify(out, null, 2));
} finally {
	await pool.end();
}
