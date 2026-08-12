import { describe, expect, it } from 'vitest';

import { computePacketKey } from '../atlas/identity/packet-key-builder.js';
import { buildCodeEvidenceSynthesizerReceiptFromSource } from './code-evidence-synthesizer.js';

describe('code-evidence-synthesizer', () => {
	it('builds a durable receipt from the local classifier packet', async () => {
		const packetKey = computePacketKey(
			'src/lib/server/example.ts',
			'tree:node:7',
			'title:session-store'
		);

		const result = await buildCodeEvidenceSynthesizerReceiptFromSource({
			packetKey,
			sourceRef: 'src/lib/server/example.ts',
			sourceRevision: 'source:rev-1',
			treeNodeId: 'tree:node:7',
			titleId: 'title:session-store',
			featureId: 'feature:session-store',
			featureLabel: 'Session store',
			text: 'export class SessionStore { loadSession(sessionId: string) { return sessionId; } }',
			isCode: true,
			representationRevision: 'semantic_768@1',
			producerId: 'source-pos-concept-adapter',
			producerRevision: 'source-pos-concept-adapter-v1',
			featureRevision: 'feature:v1',
			vectorRefs: ['qdrant:point:session-store'],
			semanticConceptIds: ['concept:session', 'concept:store'],
			ontologyIds: ['ontology:session-store'],
			extractedFeatures: [
				{
					type: 'ast_class',
					name: 'SessionStore',
					description: 'Class SessionStore',
					source: 'ast-grep',
					lineNumber: 1,
					confidence: 0.95,
				},
				{
					type: 'ast_function',
					name: 'loadSession',
					description: 'Function loadSession',
					source: 'ast-grep',
					lineNumber: 2,
					confidence: 0.95,
				},
				{
					type: 'entity_org',
					name: 'OpenAI',
					description: 'ORG entity: "OpenAI"',
					source: 'langextract',
					confidence: 0.88,
				},
			],
		});

		expect(result).not.toBeNull();
		expect(result?.packet.packetKey).toBe(packetKey);
		expect(result?.receipt.schemaVersion).toBe('code-evidence-synthesizer-receipt.v1');
		expect(result?.receipt.packetKey).toBe(packetKey);
		expect(result?.receipt.semanticDimension).toBe(768);
		expect(result?.receipt.extractedFeatureCount).toBe(3);
		expect(result?.receipt.astSymbolCount).toBeGreaterThan(0);
		expect(result?.receipt.primaryDomain).toBe('pos-tagging');
		expect(result?.receipt.status).toBe('BUILT');
		expect(result?.receipt.receiptId).toMatch(/^code-evidence:/);
		expect(result?.receipt.inputDigest).toMatch(/^sha256:/);
		expect(result?.receipt.outputDigest).toMatch(/^sha256:/);
		expect(result?.semanticFeatureEnvelope.schemaVersion).toBe('semantic-feature-envelope.v1');
		expect(result?.semanticFeatureEnvelope.vectorRefs).toEqual(['qdrant:point:session-store']);
	});
});
