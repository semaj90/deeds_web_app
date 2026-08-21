import { z } from 'zod';
import { buildSmartRpcPacket, SmartRpcPacketSchema, type SmartRpcPacketV1 } from './smart-packet-fabric.js';

export const StructuralIdentityAttestationSchema = z.object({
	schema: z.literal('atlas.structural-identity-attestation.v1'),
	canonicalId: z.string().min(1),
	packetKey: z.string().min(1),
	sourceRef: z.string().min(1),
	sourceRevision: z.string().min(1),
	treeNodeId: z.string().min(1),
	symbolVersionId: z.string().min(1).nullable(),
	nodeType: z.string().min(1),
	astPath: z.array(z.number().int().nonnegative()).optional(),
	parentAstPath: z.array(z.number().int().nonnegative()).optional(),
	startByte: z.number().int().nonnegative(),
	endByte: z.number().int().nonnegative(),
	grammarRevision: z.string().min(1).nullable(),
	canonicalOwnerAttested: z.literal(true),
	producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
	if (value.endByte < value.startByte) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'endByte must be >= startByte' });
});
export type StructuralIdentityAttestationV1 = z.infer<typeof StructuralIdentityAttestationSchema>;

export function materializeStructuralCoordinates(
	packetInput: SmartRpcPacketV1,
	attestationInput: StructuralIdentityAttestationV1,
): SmartRpcPacketV1 {
	const packet = SmartRpcPacketSchema.parse(packetInput);
	const attestation = StructuralIdentityAttestationSchema.parse(attestationInput);
	if (packet.canonicalId !== attestation.canonicalId) throw new Error('canonicalId mismatch');
	if (packet.packetKey !== attestation.packetKey) throw new Error('packetKey mismatch');
	if (packet.revisions.sourceRevision && packet.revisions.sourceRevision !== attestation.sourceRevision) throw new Error('sourceRevision mismatch');
	if (packet.structural.sourceRef.replaceAll('\\', '/').toLowerCase() !== attestation.sourceRef.replaceAll('\\', '/').toLowerCase()) throw new Error('sourceRef mismatch');
	if (packet.structural.treeNodeId && packet.structural.treeNodeId !== attestation.treeNodeId) throw new Error('existing treeNodeId conflicts with canonical attestation');
	if (packet.structural.symbolVersionId && attestation.symbolVersionId && packet.structural.symbolVersionId !== attestation.symbolVersionId) throw new Error('existing symbolVersionId conflicts with canonical attestation');

	const { schema: _schema, contentChecksum: _checksum, ...rest } = packet;
	return buildSmartRpcPacket({
		...rest,
		structural: {
			...packet.structural,
			treeNodeId: attestation.treeNodeId,
			symbolVersionId: attestation.symbolVersionId ?? undefined,
			nodeType: attestation.nodeType,
			astPath: attestation.astPath,
			parentAstPath: attestation.parentAstPath,
			startByte: attestation.startByte,
			endByte: attestation.endByte,
		},
	});
}
