import { getAnalysisPassResultByIdempotencyKey } from './analysis-pass-results.js';
import { stableStringify, sha256Hex } from './stable-hash.js';
import type { CodeEvidenceSynthesizerReceipt } from './code-evidence-synthesizer.js';

const READBACK_SCHEMA_VERSION = 'code-evidence-readback-receipt.v1' as const;

export type CodeEvidenceReadbackStatus = 'FOUND' | 'NOT_FOUND' | 'REVISION_MISMATCH';

/**
 * The identity the caller expects the stored row to have. Any supplied field
 * that doesn't match what's actually stored flips status to
 * REVISION_MISMATCH — this function never silently falls back to "close
 * enough" when identity doesn't line up.
 */
export interface CodeEvidenceReadbackExpectedIdentity {
	sourceRef?: string;
	sourceRevision?: string;
	packetKey?: string;
	schemaRevision?: string;
	producerRevision?: string;
	synthesisReceiptHash?: string;
	posConceptPacketHash?: string;
}

export interface CodeEvidenceReadbackReceiptV1 {
	schemaVersion: typeof READBACK_SCHEMA_VERSION;
	status: CodeEvidenceReadbackStatus;
	evidenceId: string | null;
	passKey: string | null;
	sourceRef: string | null;
	sourceRevision: string | null;
	/** Not captured by any writer in this lane yet — always null today. */
	parseNodeId: string | null;
	treeNodeId: string | null;
	packetKey: string | null;
	synthesisReceiptHash: string | null;
	posConceptPacketHash: string | null;
	schemaRevision: string | null;
	producerRevision: string | null;
	persistedAt: string | null;
	mismatches: string[];
}

function notFoundReceipt(passKey: string): CodeEvidenceReadbackReceiptV1 {
	return {
		schemaVersion: READBACK_SCHEMA_VERSION,
		status: 'NOT_FOUND',
		evidenceId: null,
		passKey,
		sourceRef: null,
		sourceRevision: null,
		parseNodeId: null,
		treeNodeId: null,
		packetKey: null,
		synthesisReceiptHash: null,
		posConceptPacketHash: null,
		schemaRevision: null,
		producerRevision: null,
		persistedAt: null,
		mismatches: [],
	};
}

/**
 * Read back exactly what was persisted for a code-evidence ledger row by its
 * durable pass_key identity.
 *
 * Deliberately does NOT recompute classifications, embeddings, POS tags, or
 * synthesis — it proves what was actually stored, nothing more. The two
 * content hashes (synthesisReceiptHash, posConceptPacketHash) are computed
 * fresh from the stored JSON on every call rather than trusted from a field
 * embedded inside that same JSON, so a caller comparing against a hash it
 * computed at enqueue time is verifying store-vs-read integrity, not just
 * that the payload is internally self-consistent.
 *
 * If `expected` is supplied and any field differs from what's stored, status
 * is REVISION_MISMATCH with the specific mismatches listed — never a silent
 * fallback to the stored value.
 */
export async function readCodeEvidenceLedgerEntry(
	passKey: string,
	expected?: CodeEvidenceReadbackExpectedIdentity
): Promise<CodeEvidenceReadbackReceiptV1> {
	const row = await getAnalysisPassResultByIdempotencyKey(passKey);
	if (!row) return notFoundReceipt(passKey);

	const provenance = (row.provenance ?? {}) as Record<string, unknown>;
	const output = (row.output ?? {}) as Record<string, unknown>;
	const storedReceipt = output.codeEvidenceReceipt as CodeEvidenceSynthesizerReceipt | undefined;
	const storedPacket = output.posConceptPacket as Record<string, unknown> | undefined;

	const synthesisReceiptHash = storedReceipt ? sha256Hex(stableStringify(storedReceipt)) : null;
	const posConceptPacketHash = storedPacket ? sha256Hex(stableStringify(storedPacket)) : null;

	const receipt: CodeEvidenceReadbackReceiptV1 = {
		schemaVersion: READBACK_SCHEMA_VERSION,
		status: 'FOUND',
		evidenceId: String(row.id),
		passKey: row.passKey,
		sourceRef: row.sourceRef ?? (typeof provenance.sourceRef === 'string' ? provenance.sourceRef : null),
		sourceRevision:
			row.sourceRevision ?? (typeof provenance.sourceRevision === 'string' ? provenance.sourceRevision : null),
		parseNodeId: null,
		treeNodeId: storedReceipt?.treeNodeId ?? null,
		packetKey: row.packetKey ?? null,
		synthesisReceiptHash,
		posConceptPacketHash,
		schemaRevision: storedReceipt?.schemaVersion ?? null,
		producerRevision:
			typeof provenance.producerRevision === 'string' ? provenance.producerRevision : null,
		persistedAt: row.createdAt ?? null,
		mismatches: [],
	};

	if (!expected) return receipt;

	const checks: Array<[keyof CodeEvidenceReadbackExpectedIdentity, string | null]> = [
		['sourceRef', receipt.sourceRef],
		['sourceRevision', receipt.sourceRevision],
		['packetKey', receipt.packetKey],
		['schemaRevision', receipt.schemaRevision],
		['producerRevision', receipt.producerRevision],
		['synthesisReceiptHash', receipt.synthesisReceiptHash],
		['posConceptPacketHash', receipt.posConceptPacketHash],
	];

	const mismatches: string[] = [];
	for (const [key, actual] of checks) {
		const expectedValue = expected[key];
		if (expectedValue !== undefined && expectedValue !== actual) {
			mismatches.push(`${key}: expected "${expectedValue}", stored "${String(actual)}"`);
		}
	}

	if (mismatches.length > 0) {
		return { ...receipt, status: 'REVISION_MISMATCH', mismatches };
	}

	return receipt;
}
