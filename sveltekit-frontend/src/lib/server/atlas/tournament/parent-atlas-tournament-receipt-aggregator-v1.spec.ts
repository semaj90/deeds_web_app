import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	aggregateParentAtlasTournamentReceiptsV1,
	loadParentAtlasTournamentSnapshotV1
} from './parent-atlas-tournament-receipt-aggregator-v1.js';

describe('Parent Atlas tournament receipt aggregation', () => {
	it('fails closed for gates with no accepted evidence', () => {
		const snapshot = aggregateParentAtlasTournamentReceiptsV1([]);
		expect(snapshot.progress.proofProgressPct).toBe(0);
		expect(snapshot.gates.every((gate) => gate.state === 'UNPROVEN')).toBe(true);
	});

	it('keeps execution efficiency separate from proof state', () => {
		const snapshot = aggregateParentAtlasTournamentReceiptsV1([], {
			inputTokens: 100,
			outputTokens: 100,
			baselineInputTokens: 1000,
			baselineOutputTokens: 1000,
			kvCacheReadTokens: 900,
			kvCacheWriteTokens: 100
		});
		expect(snapshot.progress.proofProgressPct).toBe(0);
		expect(snapshot.progress.efficiency.tokenSavingsPct).toBe(90);
		expect(snapshot.progress.efficiency.kvReusePct).toBe(90);
	});

	it('adapts explicit receipt schemas without promoting a canary to full completion', async () => {
		const root = await mkdtemp(join(tmpdir(), 'atlas-tournament-'));
		const reports = join(root, 'docs', 'reports');
		await mkdir(reports, { recursive: true });
		await writeFile(join(reports, 'structural-intelligence-integration-proof.json'), JSON.stringify({
			schema: 'atlas.structural-intelligence-integration-proof.v1',
			generatedAt: '2026-08-29T17:13:54.082Z',
			status: 'PROVEN_WITH_LIVE_8095'
		}));
		await writeFile(join(reports, 'lineage-qualified-current-candidate-map-v2.json'), JSON.stringify({
			schema: 'atlas.lineage-qualified-candidate-map-receipt.v1',
			generatedAt: '2026-08-29T18:00:00.000Z',
			actualCandidateCount: 15,
			lineage: {
				sourceRefEquality: true,
				packetChunkContentHashEquality: true,
				uniqueGraphifySourceRow: true,
				syntheticRevisionFallbacks: false
			},
			map: { schema: 'atlas.candidate-ordinal-map.v1', rowCount: 15 }
		}));

		const snapshot = await loadParentAtlasTournamentSnapshotV1(root);
		const tree = snapshot.gates.find((gate) => gate.id === 'treesitter_ast');
		const ordinal = snapshot.gates.find((gate) => gate.id === 'candidate_ordinal');
		expect(tree?.state).toBe('PROVEN');
		expect(ordinal?.state).toBe('PARTIAL');
		expect(ordinal?.completion).toBeCloseTo(15 / 128);
		expect(snapshot.progress.proofProgressPct).toBeGreaterThan(0);
		expect(snapshot.progress.proofProgressPct).toBeLessThan(100);
	});
});
