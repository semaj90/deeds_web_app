import crypto from 'node:crypto';
import { z } from 'zod';

export const NES_PACKET_SCHEMA_ID = 'nes.packet.v1';

const isoTimestamp = z.string().datetime({ offset: true });

export const nesPacketV1Schema = z
	.object({
		schema_version: z.literal(NES_PACKET_SCHEMA_ID),
		packet_id: z.string().min(8),
		packet_kind: z.literal('parent_atlas_phase101'),
		workspace_id: z.string().min(1),
		workspace_task_id: z.string().min(1),
		title_id: z.string().min(1),
		feature_id: z.string().min(1),
		featureIds: z.array(z.string().min(1)).optional(),
		source_ref: z.string().min(1),
		source_refs: z.array(z.string().min(1)),
		point_kind: z.enum(['task_summary', 'feature_summary', 'code_chunk', 'centroid']),
		semantic_path: z.array(z.string().min(1)),
		related_feature_ids: z.array(z.string().min(1)),
		related_task_ids: z.array(z.string().min(1)),
		related_file_paths: z.array(z.string().min(1)),
		cluster_id: z.string().nullable(),
		centroid_id: z.string().nullable(),
		parent_centroid_id: z.string().nullable(),
		summary_llm: z.string().min(1),
		summary_model: z.string().min(1),
		summary_hash: z.string().min(1),
		confidence: z.number().min(0).max(1),
		status: z.enum(['todo', 'doing', 'blocked', 'done']),
		agent_pickup_ready: z.boolean(),
		observed_at: isoTimestamp,
		updated_at: isoTimestamp,
		valid_from: isoTimestamp,
		valid_to: isoTimestamp.nullable(),
		deleted: z.boolean(),
		cache_key: z.string().min(8),
		cache_backend: z.enum(['redis', 'file', 'dry-run', 'none']),
		recommendation: z.object({
			command: z.string().min(1),
			read_only: z.boolean(),
			reason: z.string().min(1),
		}),
		phase_status_excerpt: z.string().min(1),
		context_pack_refs: z.array(z.string().min(1)),
		missing_env_vars: z.array(z.string().min(1)),
		notes: z.array(z.string().min(1)),
	})
	.strict();

export const nesPacketV1DraftSchema = z
	.object({
		schema_version: z.literal(NES_PACKET_SCHEMA_ID),
		packet_kind: z.literal('parent_atlas_phase101'),
		workspace_id: z.string().min(1),
		workspace_task_id: z.string().min(1),
		title_id: z.string().min(1),
		feature_id: z.string().min(1),
		featureIds: z.array(z.string().min(1)).optional(),
		source_ref: z.string().min(1),
		source_refs: z.array(z.string().min(1)),
		point_kind: z.enum(['task_summary', 'feature_summary', 'code_chunk', 'centroid']),
		semantic_path: z.array(z.string().min(1)),
		related_feature_ids: z.array(z.string().min(1)),
		related_task_ids: z.array(z.string().min(1)),
		related_file_paths: z.array(z.string().min(1)),
		cluster_id: z.string().nullable(),
		centroid_id: z.string().nullable(),
		parent_centroid_id: z.string().nullable(),
		summary_llm: z.string().min(1),
		summary_model: z.string().min(1),
		confidence: z.number().min(0).max(1),
		status: z.enum(['todo', 'doing', 'blocked', 'done']),
		agent_pickup_ready: z.boolean(),
		recommendation: z.object({
			command: z.string().min(1),
			read_only: z.boolean(),
			reason: z.string().min(1),
		}),
		phase_status_excerpt: z.string().min(1),
		context_pack_refs: z.array(z.string().min(1)),
		missing_env_vars: z.array(z.string().min(1)),
		notes: z.array(z.string().min(1)),
	})
	.strict();

export function buildPhase101PacketId(packet) {
	const basis = [
		packet.schema_version,
		packet.workspace_task_id,
		packet.title_id,
		packet.feature_id,
		packet.source_ref,
		packet.summary_model,
		packet.summary_llm,
	].join('|');
	return `nes.packet.v1.${cryptoHash(basis).slice(0, 24)}`;
}

export function cryptoHash(input) {
	return crypto.createHash('sha256').update(String(input)).digest('hex');
}
