import { describe, expect, it } from 'vitest';
import {
	auditCurrentStackContractV1,
	CURRENT_WORKSTATION_STACK_V1,
} from './current-stack-contract-v1.js';

describe('current-stack-contract-v1', () => {
	it('accepts the verified live :8090 / :8094 / :8095 / :8098 stack', () => {
		expect(auditCurrentStackContractV1(CURRENT_WORKSTATION_STACK_V1)).toEqual({
			status: 'CURRENT',
			issues: [],
		});
	});

	it('flags superseded Ornith 1.5 and legacy embeddinggemma_300m_onnx / 384-dim configs', () => {
		const stale = {
			...CURRENT_WORKSTATION_STACK_V1,
			synthesis8090: { port: 8090, modelId: 'ornith-1.5-9b' },
			embedding8094: {
				port: 8094,
				modelFamily: 'embeddinggemma2',
				modelId: 'embeddinggemma_300m_onnx',
				canonicalDim: 384,
				mrlDims: [768, 512, 256, 128],
			},
		};
		const result = auditCurrentStackContractV1(stale);
		expect(result.status).toBe('STALE_OR_SUPERSEDED');
		expect(result.issues.some((m) => m.includes('SUPERSEDED_SYNTHESIS_MODEL'))).toBe(true);
		expect(result.issues.some((m) => m.includes('SUPERSEDED_EMBEDDING_MODEL'))).toBe(true);
	});

	it('rejects any :8098 classifier config claiming canonicalAuthority=true', () => {
		const result = auditCurrentStackContractV1({
			...CURRENT_WORKSTATION_STACK_V1,
			classifierFastApi8098: {
				...CURRENT_WORKSTATION_STACK_V1.classifierFastApi8098,
				canonicalAuthority: true,
			},
		});
		expect(result.status).toBe('STALE_OR_SUPERSEDED');
	});
});
