import { describe, expect, it } from 'vitest';
import { resolveGraphAuthorityV2Policy } from './authority-feature-flag.js';

describe('Parent Atlas graph authority V2 feature isolation', () => {
	it('defaults to fixture validation with production ranking unchanged', () => {
		expect(resolveGraphAuthorityV2Policy({})).toEqual({ enabled: false, promotionEnabled: false, mode: 'fixture-validation' });
	});

	it('allows read-only V2 computation but rejects promotion without parity', () => {
		expect(resolveGraphAuthorityV2Policy({ ATLAS_GRAPH_AUTHORITY_V2_ENABLED: 'true' })).toEqual({ enabled: true, promotionEnabled: false, mode: 'read-only-live' });
		expect(() => resolveGraphAuthorityV2Policy({
			ATLAS_GRAPH_AUTHORITY_V2_ENABLED: 'true',
			ATLAS_GRAPH_AUTHORITY_V2_PROMOTION_ENABLED: 'true'
		})).toThrow(/PAGERANK_PARITY_PROVEN/);
	});

	it('rejects promotion even with parity because canary promotion is deliberately out of scope', () => {
		expect(() => resolveGraphAuthorityV2Policy({
			ATLAS_GRAPH_AUTHORITY_V2_ENABLED: 'true',
			ATLAS_GRAPH_AUTHORITY_V2_PROMOTION_ENABLED: 'true'
		}, {
			status: 'PAGERANK_PARITY_PROVEN',
			topologyHash: 'topology',
			networkxResultHash: 'networkx',
			neo4jResultHash: 'neo4j'
		})).toThrow(/not implemented/);
	});
});
