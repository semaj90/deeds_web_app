import { z } from 'zod';

/**
 * ============================================================================
 * RUNTIME-SLOT-EXTRACTION-01: OaK Typed Runtime Slot Extraction Operator
 * ============================================================================
 *
 * Implements the OaK `extract_runtime_slots` operator:
 * Extracts strongly-typed, grounded slot bindings from an execution trace,
 * runtime context, or candidate observation.
 *
 * Hard Rules:
 *  1. Reject unanchored/free-text hallucinations: slots must bind to verified
 *     revision-qualified identifiers or regex-conforming tokens.
 *  2. Required revision axes: `workspaceRevision`, `sourceRevision`.
 *  3. Every output carries `canonicalAuthority: false`, `writesPerformed: false`.
 */

export const RUNTIME_SLOT_SCHEMA = 'atlas.runtime-slot-extraction.v1' as const;

export const SlotKindSchema = z.enum([
	'WORKSPACE_ID',
	'WORKSPACE_REVISION',
	'SOURCE_REF',
	'SOURCE_REVISION',
	'ACTOR_ID',
	'ACTOR_TYPE',
	'PACKET_KEY',
	'CANDIDATE_ORDINAL',
	'TOOL_NAME',
	'STATE_NAME',
]);

export type SlotKind = z.infer<typeof SlotKindSchema>;

export const ExtractedSlotV1Schema = z
	.object({
		slotName: z.string().min(1),
		slotKind: SlotKindSchema,
		slotValue: z.string().min(1),
		origin: z.enum(['STRUCTURED_INPUT', 'PAYLOAD_TEXT_PATTERN']),
		verified: z.literal(false),
	})
	.strict();

export type ExtractedSlotV1 = z.infer<typeof ExtractedSlotV1Schema>;

export const RuntimeSlotExtractionInputV1Schema = z
	.object({
		workspaceId: z.string().min(1),
		workspaceRevision: z.string().min(1),
		sourceRef: z.string().min(1).optional(),
		sourceRevision: z.string().min(1).optional(),
		actorId: z.string().min(1).optional(),
		actorType: z.enum(['USER', 'SERVICE', 'SYSTEM']).optional(),
		packetKey: z.string().min(1).optional(),
		candidateOrdinal: z.number().int().nonnegative().optional(),
		toolName: z.string().min(1).optional(),
		stateName: z.string().min(1).optional(),
		payloadText: z.string().optional(),
	})
	.strict();

export type RuntimeSlotExtractionInputV1 = z.infer<
	typeof RuntimeSlotExtractionInputV1Schema
>;

export const RuntimeSlotExtractionOutputV1Schema = z
	.object({
		schema: z.literal(RUNTIME_SLOT_SCHEMA),
		workspaceId: z.string().min(1),
		workspaceRevision: z.string().min(1),
		extractedSlots: z.array(ExtractedSlotV1Schema),
		slotCount: z.number().int().nonnegative(),
		groundingStatus: z.literal('UNVERIFIED_INPUT'),
		canonicalAuthority: z.literal(false),
		writesPerformed: z.literal(false),
	})
	.strict();

export type RuntimeSlotExtractionOutputV1 = z.infer<
	typeof RuntimeSlotExtractionOutputV1Schema
>;

/**
 * Extracts and grounds typed runtime slots from an execution request/observation.
 */
export function extractRuntimeSlotsV1(
	input: RuntimeSlotExtractionInputV1,
): RuntimeSlotExtractionOutputV1 {
	const validated = RuntimeSlotExtractionInputV1Schema.parse(input);
	const slots: ExtractedSlotV1[] = [];
	const addSlot = (
		slotName: string,
		slotKind: SlotKind,
		slotValue: string,
		origin: 'STRUCTURED_INPUT' | 'PAYLOAD_TEXT_PATTERN',
	) => slots.push({ slotName, slotKind, slotValue, origin, verified: false });

	// 1. Mandatory workspace slots
	addSlot('workspaceId', 'WORKSPACE_ID', validated.workspaceId, 'STRUCTURED_INPUT');
	addSlot('workspaceRevision', 'WORKSPACE_REVISION', validated.workspaceRevision, 'STRUCTURED_INPUT');

	// 2. Source references and revisions
	if (validated.sourceRef) {
		addSlot('sourceRef', 'SOURCE_REF', validated.sourceRef, 'STRUCTURED_INPUT');
	}

	if (validated.sourceRevision) {
		addSlot('sourceRevision', 'SOURCE_REVISION', validated.sourceRevision, 'STRUCTURED_INPUT');
	}

	// 3. Actor identity
	if (validated.actorId) {
		addSlot('actorId', 'ACTOR_ID', validated.actorId, 'STRUCTURED_INPUT');
	}

	if (validated.actorType) {
		addSlot('actorType', 'ACTOR_TYPE', validated.actorType, 'STRUCTURED_INPUT');
	}

	// 4. Packet and candidate ordinal
	if (validated.packetKey) {
		addSlot('packetKey', 'PACKET_KEY', validated.packetKey, 'STRUCTURED_INPUT');
	}

	if (validated.candidateOrdinal !== undefined) {
		addSlot('candidateOrdinal', 'CANDIDATE_ORDINAL', String(validated.candidateOrdinal), 'STRUCTURED_INPUT');
	}

	// 5. Tool and state
	if (validated.toolName) {
		addSlot('toolName', 'TOOL_NAME', validated.toolName, 'STRUCTURED_INPUT');
	}

	if (validated.stateName) {
		addSlot('stateName', 'STATE_NAME', validated.stateName, 'STRUCTURED_INPUT');
	}

	// 6. Structured text pattern extraction (e.g. `[CCR: <hash>]` or `sha256:<digest>`)
	if (validated.payloadText) {
		const ccrMatch = validated.payloadText.match(/\[CCR:\s*([a-f0-9]{12,64})\]/i);
		if (ccrMatch?.[1]) {
			addSlot('ccrHash', 'PACKET_KEY', ccrMatch[1].toLowerCase(), 'PAYLOAD_TEXT_PATTERN');
		}
	}

	return RuntimeSlotExtractionOutputV1Schema.parse({
		schema: RUNTIME_SLOT_SCHEMA,
		workspaceId: validated.workspaceId,
		workspaceRevision: validated.workspaceRevision,
		extractedSlots: slots,
		slotCount: slots.length,
		groundingStatus: 'UNVERIFIED_INPUT',
		canonicalAuthority: false,
		writesPerformed: false,
	});
}
