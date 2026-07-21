import { describe, expect, it } from 'vitest';
import { indexByDir, joinAlignedRows } from './features.js';

describe('feature loader joins', () => {
	it('prefers normalized facts and carries ontology concepts forward', () => {
		const rows = joinAlignedRows({
			implementations: [
				{
					featureKey: 'feature.alpha',
					featureName: 'Feature Alpha',
					description: 'alpha description',
					laneIds: ['L1'],
					status: 'active',
					confidence: 1,
					packetKey: 'packet:alpha',
					sourceRef: 'src/alpha.ts',
					contentHash: 'hash-alpha',
				},
			],
			edges: [
				{
					featureKey: 'feature.alpha',
					filePath: 'src/alpha.ts',
					entryExport: 'runAlpha',
					role: 'primary',
					packetKey: 'packet:alpha',
					sourceRef: 'src/alpha.ts',
					contentHash: 'hash-alpha',
				},
			],
			lexicalFacts: [
				{
					packetKey: 'packet:alpha',
					sourceRef: 'src/alpha.ts',
					featureKey: 'feature.alpha',
					keywords: ['alpha', 'beta'],
					identifiers: ['runAlpha'],
					symbols: ['runAlpha'],
					importedModules: ['node:path'],
					lexicalSummary: 'Alpha summary',
					language: 'typescript',
					contentHash: 'hash-alpha',
				},
			],
			domainFacts: [
				{
					packetKey: 'packet:alpha',
					sourceRef: 'src/alpha.ts',
					featureKey: 'feature.alpha',
					domainClass: 'backend',
					contentHash: 'hash-alpha',
				},
			],
			structuralFacts: [
				{
					packetKey: 'packet:alpha',
					sourceRef: 'src/alpha.ts',
					featureKey: 'feature.alpha',
					treeNodeId: 'tree-1',
					symbolName: 'runAlpha',
					contentHash: 'hash-alpha',
				},
			],
			ontologyFacts: [
				{
					packetKey: 'packet:alpha',
					sourceRef: 'src/alpha.ts',
					featureKey: 'feature.alpha',
					subjectType: 'packet',
					subjectId: 'packet:alpha',
					predicate: 'USES_CONCEPT',
					objectType: 'concept',
					objectId: 'concept:alpha',
					objectValue: { concept: 'alpha' },
				},
			],
		} as never);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			featureKey: 'feature.alpha',
			packetKey: 'packet:alpha',
			sourceRef: 'src/alpha.ts',
			contentHash: 'hash-alpha',
			domainClass: 'backend',
			treeNodeId: 'tree-1',
			usedConcepts: ['alpha'],
			normalizedSource: 'postgres:feature_facts',
		});
		expect(rows[0].files).toEqual(['src/alpha.ts']);
		expect(rows[0].keywords).toEqual(['alpha', 'beta']);
		expect(rows[0].identifiers).toEqual(['runAlpha']);
	});

	it('indexes rows by directory without duplicates', () => {
		const byDir = indexByDir([
			{
				featureKey: 'feature.alpha',
				featureName: 'Feature Alpha',
				description: '',
				laneIds: [],
				status: 'active',
				confidence: 1,
				files: ['src/alpha.ts', 'src/alpha.ts', 'src/nested/beta.ts'],
			},
		]);

		expect(Array.from(byDir.keys()).sort()).toEqual(['src', 'src/nested']);
		expect(byDir.get('src')).toHaveLength(1);
		expect(byDir.get('src/nested')).toHaveLength(1);
	});
});
