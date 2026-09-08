import { createHash } from 'node:crypto';
import { z } from 'zod';
import { sha256Stable } from '../agentic-file-compiler/contracts.js';

export const LexicalInputProofSchema = z.object({
	 schema: z.literal('atlas.lexical.input-proof.v1'),
	 packetKey: z.string().min(1),
	 sourceRef: z.string().min(1),
	 sourceRevision: z.string().min(1),
	 workspaceRevision: z.string().min(1),
	 declaredContentHash: z.string().length(64),
	 computedContentHash: z.string().length(64),
	 byteLength: z.number().int().nonnegative(),
	 tokenizerRevision: z.string().min(1),
	 lexicalDerivationRevision: z.string().min(1),
	 textSearchConfig: z.string().min(1),
	 eligible: z.boolean(),
	 rejectionReason: z.string().min(1).optional(),
	 inputChecksum: z.string().length(64),
}).strict();

export type LexicalInputProofV1 = z.infer<typeof LexicalInputProofSchema>;

export interface LexicalInputProofInput {
	packetKey: string;
	sourceRef: string;
	content: string;
	declaredContentHash: string;
	sourceRevision: string;
	workspaceRevision: string;
	sourceRevisionProven: boolean;
	workspaceRevisionCurrent: boolean;
	canonicalBindingExact: boolean;
	tokenizerRevision: string;
	lexicalDerivationRevision: string;
	textSearchConfig: string;
}

export function sha256Utf8(value: string): string {
	return createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
}

export function buildLexicalInputProof(input: LexicalInputProofInput): LexicalInputProofV1 {
	const computedContentHash = sha256Utf8(input.content);
	const rejectionReason = input.declaredContentHash !== computedContentHash
		? 'CONTENT_HASH_MISMATCH'
		: !input.sourceRevisionProven
			? 'SOURCE_REVISION_UNPROVEN'
			: !input.workspaceRevisionCurrent
				? 'WORKSPACE_REVISION_NOT_CURRENT'
				: !input.canonicalBindingExact
					? 'CANONICAL_BINDING_NOT_EXACT'
					: undefined;
	const body = {
		schema: 'atlas.lexical.input-proof.v1' as const,
		packetKey: input.packetKey,
		sourceRef: input.sourceRef,
		sourceRevision: input.sourceRevision,
		workspaceRevision: input.workspaceRevision,
		declaredContentHash: input.declaredContentHash,
		computedContentHash,
		byteLength: Buffer.byteLength(input.content, 'utf8'),
		tokenizerRevision: input.tokenizerRevision,
		lexicalDerivationRevision: input.lexicalDerivationRevision,
		textSearchConfig: input.textSearchConfig,
		eligible: rejectionReason === undefined,
		...(rejectionReason ? { rejectionReason } : {}),
	};
	return LexicalInputProofSchema.parse({ ...body, inputChecksum: sha256Stable(body) });
}
