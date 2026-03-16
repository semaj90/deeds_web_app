/**
 * Maps CH-ROM97 ParsedRune data to NES LegalDocument format
 * for allocation into NES memory banks.
 */

import type { ParsedRune } from '$lib/shared/chr97-reader.js';
import type { LegalDocument } from './nes-memory-architecture.js';

interface CartridgeMeta {
	caseId: string;
	embeddingDim?: number;
	collections?: string[];
	sources?: string[];
}

export function runeToLegalDocument(
	rune: ParsedRune,
	tensor: Float32Array | undefined,
	metadata: CartridgeMeta
): Omit<LegalDocument, 'lastAccessed'> {
	// Normalize manifold[2] to 0-1 confidence (assuming raw range roughly -1..1)
	const rawConf = rune.manifold[2] ?? 0;
	const confidence = Math.max(0, Math.min(1, (rawConf + 1) / 2));

	// Risk level from manifold[3] quartiles
	const rawRisk = (((rune.manifold[3] ?? 0) + 1) / 2);
	const riskLevel: LegalDocument['riskLevel'] =
		rawRisk > 0.75 ? 'critical' :
		rawRisk > 0.5 ? 'high' :
		rawRisk > 0.25 ? 'medium' : 'low';

	// Document type from graph connectivity
	const type: LegalDocument['type'] =
		rune.graphDegree > 5 ? 'citation' :
		rune.graphDegree > 2 ? 'evidence' : 'brief';

	// Virtual size from quant4 bytes (min 64B for bank allocation)
	const size = Math.max(
		64,
		(rune.quant4[0] + rune.quant4[1] + rune.quant4[2] + rune.quant4[3]) * 4
	);

	return {
		id: String(rune.id),
		type,
		priority: 0, // Calculated by NES allocator
		size,
		confidenceLevel: confidence,
		riskLevel,
		compressed: true,
		metadata: {
			caseId: metadata.caseId,
			vectorEmbedding: tensor,
		},
	};
}
