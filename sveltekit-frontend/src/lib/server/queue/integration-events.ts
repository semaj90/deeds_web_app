import { z } from 'zod';

export const integrationEventTypeSchema = z.enum(['code.evidence.persisted']);

export type IntegrationEventType = z.infer<typeof integrationEventTypeSchema>;

export const integrationEventBaseSchema = z.object({
	eventId: z.string().uuid(),
	eventType: integrationEventTypeSchema,
	occurredAt: z.string().datetime(),
	traceId: z.string().optional(),
	sourceRef: z.string().optional(),
});

export type IntegrationEventBase = z.infer<typeof integrationEventBaseSchema>;
export type IntegrationEvent<T = unknown> = IntegrationEventBase & { payload: T };

export const codeEvidencePersistedPayloadSchema = z.object({
	evidenceId: z.string().min(1),
	passKey: z.string().min(1),
	sourceRef: z.string().min(1),
	sourceRevision: z.string().min(1),
	parseNodeId: z.string().nullable(),
	packetKey: z.string().min(1),
	logicalEvidenceHash: z.string().min(1),
	synthesisReceiptHash: z.string().min(1),
	posConceptPacketHash: z.string().min(1),
	producerId: z.string().min(1),
	producerRevision: z.string().min(1),
	schemaRevision: z.string().min(1),
});

export type CodeEvidencePersistedPayloadV1 = z.infer<typeof codeEvidencePersistedPayloadSchema>;

export const codeEvidencePersistedEventSchema = integrationEventBaseSchema.extend({
	payload: codeEvidencePersistedPayloadSchema,
});

export type CodeEvidencePersistedEventV1 = z.infer<typeof codeEvidencePersistedEventSchema>;
