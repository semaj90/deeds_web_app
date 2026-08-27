import { z } from 'zod';
import { relationshipAuthoritySchema } from '@deeds/parent-atlas/core/relationship-kernel';

export const HyperRelationParticipantV1Schema = z.object({
	canonicalId: z.string().min(1),
	role: z.string().min(1),
	ordinal: z.number().int().nonnegative()
}).strict();

export const HyperRelationV1Schema = z.object({
	schema: z.literal('atlas.hyper-relation.v1'),
	relationId: z.string().min(1),
	relationType: z.string().min(1),
	participants: z.array(HyperRelationParticipantV1Schema).min(2),
	evidenceRefs: z.array(z.string().min(1)).min(1),
	workspaceRevision: z.string().min(1),
	sourceRevision: z.string().min(1),
	producerRevision: z.string().min(1),
	// Optional: only relations built from a RelationshipKernelV1 (via
	// buildIncidenceProjectionFromRelationshipKernelsV1) carry this. A
	// hand-built HyperRelationV1 (e.g. tree-sitter CALL_BINDING facts) has no
	// domain authority to report and stays null.
	authority: relationshipAuthoritySchema.nullable().optional()
}).strict().superRefine((relation, ctx) => {
	const ordinals = new Set<number>();
	for (const participant of relation.participants) {
		if (ordinals.has(participant.ordinal)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `duplicate participant ordinal ${participant.ordinal}`,
				path: ['participants']
			});
		}
		ordinals.add(participant.ordinal);
	}
});

export type HyperRelationParticipantV1 = z.infer<typeof HyperRelationParticipantV1Schema>;
export type HyperRelationV1 = z.infer<typeof HyperRelationV1Schema>;

export function parseHyperRelationV1(input: unknown): HyperRelationV1 {
	return HyperRelationV1Schema.parse(input);
}
