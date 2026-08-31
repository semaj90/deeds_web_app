import { createHash } from 'node:crypto';
import type { ZodType } from 'zod';
import {
	adaptSimdjsonTypedEvidence,
	type SimdjsonTypedAdaptResultV1,
	type TypedEvidenceEnvelopeV1,
} from '@deeds/parent-atlas';
import { fastJsonParse, isSimdJsonAvailable } from '$lib/server/gpu/simdjson-bridge.js';

const ADAPTER_REVISION = 'simdjson-typed-evidence-bridge:v1';

export interface NdjsonTypedEvidenceReport<T> {
	artifactRef: string;
	artifactRevision: string;
	simdjsonUsed: boolean;
	totalLines: number;
	accepted: { envelope: TypedEvidenceEnvelopeV1; payload: T }[];
	rejected: { recordIndex: number; code: string; reason: string }[];
}

/**
 * artifact bytes (NDJSON) -> simdjson On-Demand per-line parse -> Zod typed
 * validation -> TypedEvidenceEnvelopeV1. This is the DAG-XJSON-01 placement
 * from openspec/changes/parent-atlas-adaptive-dag-fabric/spec.md: never
 * treat a simdjson-parsed field as a canonical id directly — the caller's
 * `payloadSchema` is what actually touches every correctness-critical
 * field, this bridge only owns getting bytes into that schema efficiently.
 *
 * `fastJsonParseStream` in simdjson-bridge.ts only chunks JSON *arrays*; it
 * does not split NDJSON (one JSON document per line), which is the shape
 * receipts/agent-event-logs/Graphify-batch artifacts actually use. This
 * bridge does the line split itself and calls `fastJsonParse` per line
 * (still routed through the simdjson addon when available, with the same
 * V8 fallback `fastJsonParse` already provides).
 */
export function parseNdjsonTypedEvidence<T>(input: {
	artifactRef: string;
	artifactRevision: string;
	ndjson: string;
	payloadSchema: ZodType<T>;
	payloadSchemaId: string;
}): NdjsonTypedEvidenceReport<T> {
	const lines = input.ndjson.split('\n').filter((line) => line.trim().length > 0);
	const rawInputChecksums = lines.map((line) => createHash('sha256').update(line, 'utf8').digest('hex'));
	const results: SimdjsonTypedAdaptResultV1<T>[] = lines.map((line, recordIndex) => {
		let record: unknown;
		try {
			record = fastJsonParse<unknown>(line);
		} catch (error) {
			return {
				status: 'REJECTED' as const,
				recordIndex,
				code: 'JSON_PARSE_FAILED' as const,
				reason: `SIMDJSON_TYPED_EVIDENCE_PARSE_FAILED:${error instanceof Error ? error.message : String(error)}`,
			};
		}
		return adaptSimdjsonTypedEvidence({
			artifactRef: input.artifactRef,
			artifactRevision: input.artifactRevision,
			sourceRef: input.artifactRef,
			sourceRevision: input.artifactRevision,
			evidenceId: `${input.artifactRef}:${recordIndex}`,
			rawInputChecksum: rawInputChecksums[recordIndex]!,
			parserRevision: 'simdjson-parser-bridge:v1',
			recordIndex,
			record,
			payloadSchema: input.payloadSchema,
			payloadSchemaId: input.payloadSchemaId,
			adapterRevision: ADAPTER_REVISION,
		});
	});

	const accepted: NdjsonTypedEvidenceReport<T>['accepted'] = [];
	const rejected: NdjsonTypedEvidenceReport<T>['rejected'] = [];
	for (const result of results) {
		if (result.status === 'ACCEPTED') accepted.push({ envelope: result.envelope, payload: result.payload });
		else rejected.push({ recordIndex: result.recordIndex, code: result.code, reason: result.reason });
	}

	return {
		artifactRef: input.artifactRef,
		artifactRevision: input.artifactRevision,
		simdjsonUsed: isSimdJsonAvailable(),
		totalLines: lines.length,
		accepted,
		rejected,
	};
}
