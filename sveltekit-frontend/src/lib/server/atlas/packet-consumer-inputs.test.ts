import { describe, expect, it } from 'vitest';

import { derivePacketInputsFromAceContext } from './packet-consumer-inputs.js';

describe('packet-consumer-inputs', () => {
	it('folds graph projection signals into the packet vector deterministically', () => {
		const inputs = derivePacketInputsFromAceContext({
			codebaseContext: [
				{
					filePath: 'src/lib/server/ace/example.ts',
					content: '',
					score: 0.2,
					pageRankScore: 0.2,
					graphAuthorityScore: 0.1,
					graphDegree: 10,
					dependencyBreadth: 10,
					endpointAffinity: 1,
					cacheAffinity: 0.6,
					processIds: ['proc-a', 'proc-b'],
					clusterKey: 'cluster-1',
				},
			],
		});

		expect(inputs).toEqual([
			{
				packetKey: 'src/lib/server/ace/example.ts',
				sourceRef: 'src/lib/server/ace/example.ts',
				content: '',
				tokenCount: 1,
				vector: [0.2, 0.2, 0.34, 1, 0.2, 0.35, 0.7, 0.6, 1],
				supportingPacketKeys: ['cluster-1'],
				packetKind: undefined,
			},
		]);

		expect(derivePacketInputsFromAceContext({
			codebaseContext: [
				{
					filePath: 'src/lib/server/ace/example.ts',
					content: '',
					score: 0.2,
					pageRankScore: 0.2,
					graphAuthorityScore: 0.1,
					graphDegree: 10,
					dependencyBreadth: 10,
					endpointAffinity: 1,
					cacheAffinity: 0.6,
					processIds: ['proc-a', 'proc-b'],
					clusterKey: 'cluster-1',
				},
			],
		})).toEqual(inputs);
	});
});
