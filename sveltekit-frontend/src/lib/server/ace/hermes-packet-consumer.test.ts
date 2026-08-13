import { describe, expect, it } from 'vitest';

import { deriveHermesPacketInputs } from './hermes-packet-consumer.js';
import type { ACEContext } from './types.js';

function minimalACEContext(): Pick<ACEContext, 'codebaseContext'> {
	return {
		codebaseContext: [
			{
				filePath: 'src/lib/server/ace/example.ts',
				content: 'export const answer = 42;',
				score: 0.9,
				encoded64Score: 0.75,
				graphAuthorityScore: 0.8,
				pageRankScore: 0.7,
				topoClass: 'api-route',
				featureFamily: 'test',
				cachedLlmOutput: 'cached summary',
				cachedLlmSource: 'ace',
				hasAuthGuard: true,
				clusterKey: 'cluster-1',
			},
		],
	};
}

describe('hermes-packet-consumer', () => {
	it('derives deterministic packet inputs from ACE context', () => {
		const first = deriveHermesPacketInputs(minimalACEContext());
		const second = deriveHermesPacketInputs(minimalACEContext());

		expect(first).toEqual(second);
		expect(first).toHaveLength(1);
		expect(first[0].packetKey).toBe('src/lib/server/ace/example.ts');
		expect(first[0].sourceRef).toBe('src/lib/server/ace/example.ts');
		expect(first[0].vector).toHaveLength(9);
		expect(first[0].supportingPacketKeys).toEqual(['cluster-1']);
	});
});
