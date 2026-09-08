import { z } from 'zod';
import { runLexicalFeatureRegistryV1 } from './lexical-feature-registry-v1.js';
import { buildLexicalPassLedgerInputV1 } from './lexical-pass-ledger-adapter-v1.js';
import { sha256Hex, stableStringify } from './stable-hash.js';
import type { AnalysisPassLedgerInput, AnalysisPassPersistResult, AnalysisPassResultRow } from '../db/schema/analysis-pass-results.js';

export const LEXICAL_WORKER_PASS_REVISION = 'lexical-worker-v2';
const identity = z.string().min(1).refine(v => v.trim() === v && !!v.trim());
const Metadata = z.object({
	packetKey: identity, sourceRef: identity, sourceRevision: identity,
	workspaceRevision: identity, text: z.string().max(262144),
	language: z.enum(['javascript', 'typescript']).optional(),
});

export interface LexicalPassDependenciesV1 {
	resolvePacketKey(key: string): Promise<string>;
	loadPacket(key: string): Promise<{
		sourceRef: string; contentHash: string | null; workspaceRevision: number;
	} | null>;
	record(input: AnalysisPassLedgerInput): Promise<AnalysisPassPersistResult | null>;
	read(id: number): Promise<AnalysisPassResultRow | null>;
}

async function productionDependencies(): Promise<LexicalPassDependenciesV1> {
	const [{ resolveCanonicalPacketKey }, { recordAnalysisPassResult }, { db },
		{ atlasPackets }, { analysisPassResults }, { eq }] = await Promise.all([
		import('../atlas/identity/packet-identity-resolver.js'),
		import('./analysis-pass-results.js'), import('../db/client.js'),
		import('../db/schema/atlas-packets.js'), import('../db/schema/analysis-pass-results.js'),
		import('drizzle-orm'),
	]);
	return {
		resolvePacketKey: resolveCanonicalPacketKey,
		loadPacket: async key => (await db.select({ sourceRef: atlasPackets.sourceRef,
			contentHash: atlasPackets.contentHash, workspaceRevision: atlasPackets.workspaceRevision })
			.from(atlasPackets).where(eq(atlasPackets.packetKey, key)).limit(1))[0] ?? null,
		record: recordAnalysisPassResult,
		read: async id => (await db.select().from(analysisPassResults)
			.where(eq(analysisPassResults.id, id)).limit(1))[0] ?? null,
	};
}

/** Explicit worker operation: qualify source bytes, extract, persist through
 * the existing ledger, and independently read the stored row before success.
 * This first adapter handles whole-source JS/TS packets with content-hash
 * revisions and atlas_packets' numeric workspace revision. Chunk/git-revision
 * adapters require their own authoritative source join and fail closed here.
 */
export async function executeLexicalPassV1(job: {
	id: string; evidenceId: string; metadata: unknown;
}, dependencies?: LexicalPassDependenciesV1) {
	identity.parse(job.id);
	identity.parse(job.evidenceId);
	const meta = Metadata.parse(job.metadata);
	if (Buffer.byteLength(meta.text, 'utf8') > 262144) throw new Error('LEXICAL_SOURCE_TOO_LARGE');
	const language = meta.language ?? (/\.tsx?$/.test(meta.sourceRef) ? 'typescript'
		: /\.[cm]?jsx?$/.test(meta.sourceRef) ? 'javascript' : null);
	if (!language) throw new Error('LEXICAL_LANGUAGE_UNSUPPORTED');
	const startedAt = new Date().toISOString();
	const deps = dependencies ?? await productionDependencies();
	const packetKey = await deps.resolvePacketKey(meta.packetKey);
	const packet = await deps.loadPacket(packetKey);
	const contentChecksum = sha256Hex(meta.text);
	if (!packet || packet.sourceRef !== meta.sourceRef ||
		String(packet.workspaceRevision) !== meta.workspaceRevision ||
		(packet.contentHash !== contentChecksum && packet.contentHash !== `sha256:${contentChecksum}`) ||
		meta.sourceRevision !== `sha256:${contentChecksum}`) {
		throw new Error('LEXICAL_SOURCE_BINDING_MISMATCH');
	}
	const result = runLexicalFeatureRegistryV1({ packetKey, sourceRef: meta.sourceRef,
		sourceRevision: meta.sourceRevision, workspaceRevision: meta.workspaceRevision,
		content: meta.text, language });
	const ledger = buildLexicalPassLedgerInputV1({ analysisJobId: job.id,
		evidenceId: job.evidenceId, passRevision: LEXICAL_WORKER_PASS_REVISION,
		startedAt, completedAt: new Date().toISOString(), result });
	const persisted = await deps.record(ledger);
	if (!persisted) throw new Error('LEXICAL_LEDGER_UNAVAILABLE');
	const stored = await deps.read(persisted.row.id);
	const provenance = stored?.provenance as Record<string, unknown> | undefined;
	if (!stored || stored.status !== 'succeeded' || stored.packetKey !== packetKey ||
		stored.sourceRef !== meta.sourceRef || stored.sourceRevision !== meta.sourceRevision ||
		stored.passRevision !== ledger.passRevision || stored.passType !== ledger.passType ||
		stored.inputHash !== ledger.inputHash || provenance?.workspaceRevision !== meta.workspaceRevision ||
		stableStringify(stored.output) !== stableStringify(ledger.payload)) {
		throw new Error('LEXICAL_LEDGER_READBACK_MISMATCH');
	}
	return { packetKey, sourceRef: meta.sourceRef, sourceRevision: meta.sourceRevision,
		workspaceRevision: meta.workspaceRevision, lexicalFeatureRegistry: result,
		ledgerReceipt: { id: stored.id, passKey: stored.passKey,
			inserted: persisted.inserted, readbackVerified: true,
			registryChecksum: result.checksum } };
}
