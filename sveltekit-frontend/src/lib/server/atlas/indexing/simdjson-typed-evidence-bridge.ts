import { createHash } from 'node:crypto';
import type { ZodType } from 'zod';
import {
	adaptSimdjsonTypedEvidence,
	type SimdjsonTypedAdaptResultV1,
	type TypedEvidenceEnvelopeV1,
} from '@deeds/parent-atlas';
import { fastJsonParseWithBackend } from '$lib/server/gpu/simdjson-bridge.js';

const ADAPTER_REVISION = 'simdjson-typed-evidence-bridge:v1';

export interface NdjsonTypedEvidenceReport<T> {
	artifactRef: string;
	artifactRevision: string;
	simdjsonUsed: boolean;
	parserExecution: {
		backend: 'SIMDJSON_NAPI' | 'V8_JSON_PARSE' | 'MIXED' | 'CACHE_ONLY' | 'NO_INPUT';
		nativeParses: number;
		fallbackParses: number;
		cacheHits: number;
	};
	totalLines: number;
	accepted: { envelope: TypedEvidenceEnvelopeV1; payload: T }[];
	rejected: { recordIndex: number; code: string; reason: string }[];
}

export type NdjsonTypedEvidenceRecordV1<T> =
	| { status: 'ACCEPTED'; recordIndex: number; envelope: TypedEvidenceEnvelopeV1; payload: T; backend: 'SIMDJSON_NAPI' | 'V8_JSON_PARSE' | 'CACHE' }
	| { status: 'REJECTED'; recordIndex: number; code: string; reason: string; backend?: 'SIMDJSON_NAPI' | 'V8_JSON_PARSE' | 'CACHE' };

const DEFAULT_MAX_NDJSON_LINE_BYTES = 8 * 1024 * 1024;

function isUint8ArrayChunk(value: unknown): value is Uint8Array {
	return ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === '[object Uint8Array]';
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
	const parserExecution = { nativeParses: 0, fallbackParses: 0, cacheHits: 0 };
	const results: SimdjsonTypedAdaptResultV1<T>[] = lines.map((line, recordIndex) => {
		const parsed = parseTypedEvidenceLine({ ...input, line, recordIndex });
		if (parsed.backend === 'SIMDJSON_NAPI') parserExecution.nativeParses++;
		else if (parsed.backend === 'V8_JSON_PARSE') parserExecution.fallbackParses++;
		else if (parsed.backend === 'CACHE') parserExecution.cacheHits++;
		return parsed.result;
	});

	const accepted: NdjsonTypedEvidenceReport<T>['accepted'] = [];
	const rejected: NdjsonTypedEvidenceReport<T>['rejected'] = [];
	for (const result of results) {
		if (result.status === 'ACCEPTED') accepted.push({ envelope: result.envelope, payload: result.payload });
		else rejected.push({ recordIndex: result.recordIndex, code: result.code, reason: result.reason });
	}
	const backend = parserExecution.nativeParses > 0 && parserExecution.fallbackParses > 0
		? 'MIXED'
		: parserExecution.nativeParses > 0
			? 'SIMDJSON_NAPI'
			: parserExecution.fallbackParses > 0
				? 'V8_JSON_PARSE'
				: parserExecution.cacheHits > 0
					? 'CACHE_ONLY'
					: 'NO_INPUT';

	return {
		artifactRef: input.artifactRef,
		artifactRevision: input.artifactRevision,
		simdjsonUsed: parserExecution.nativeParses > 0,
		parserExecution: { backend, ...parserExecution },
		totalLines: lines.length,
		accepted,
		rejected,
	};
}

/**
 * Incrementally decode and validate a UTF-8 NDJSON byte stream. Memory use is
 * bounded by the largest current line plus the caller's chunk; accepted rows
 * are yielded immediately instead of accumulating a report-sized array.
 */
export async function* parseNdjsonTypedEvidenceStream<T>(input: {
	artifactRef: string;
	artifactRevision: string;
	chunks: AsyncIterable<Uint8Array>;
	payloadSchema: ZodType<T>;
	payloadSchemaId: string;
	maxLineBytes?: number;
}): AsyncGenerator<NdjsonTypedEvidenceRecordV1<T>> {
	const maxLineBytes = input.maxLineBytes ?? DEFAULT_MAX_NDJSON_LINE_BYTES;
	if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes < 1 || maxLineBytes > DEFAULT_MAX_NDJSON_LINE_BYTES) {
		throw new RangeError(`maxLineBytes must be an integer between 1 and ${DEFAULT_MAX_NDJSON_LINE_BYTES}`);
	}

	const decoder = new TextDecoder('utf-8', { fatal: true });
	let pending = '';
	let recordIndex = 0;
	const processLine = (line: string): NdjsonTypedEvidenceRecordV1<T> | null => {
		if (line.trim().length === 0) return null;
		const currentIndex = recordIndex++;
		if (Buffer.byteLength(line, 'utf8') > maxLineBytes) {
			throw new RangeError(`NDJSON record ${currentIndex} exceeds maxLineBytes=${maxLineBytes}`);
		}
		const parsed = parseTypedEvidenceLine({ ...input, line, recordIndex: currentIndex });
		if (parsed.result.status === 'ACCEPTED') {
			return { status: 'ACCEPTED', recordIndex: currentIndex, envelope: parsed.result.envelope, payload: parsed.result.payload, backend: parsed.backend };
		}
		return { status: 'REJECTED', recordIndex: currentIndex, code: parsed.result.code, reason: parsed.result.reason, backend: parsed.backend };
	};

	try {
		for await (const chunk of input.chunks) {
			if (!isUint8ArrayChunk(chunk)) throw new TypeError('NDJSON stream chunks must be Uint8Array values');
			pending += decoder.decode(chunk, { stream: true });
			let newlineIndex = pending.indexOf('\n');
			while (newlineIndex >= 0) {
				const line = pending.slice(0, newlineIndex);
				pending = pending.slice(newlineIndex + 1);
				const record = processLine(line);
				if (record) yield record;
				newlineIndex = pending.indexOf('\n');
			}
			if (Buffer.byteLength(pending, 'utf8') > maxLineBytes) {
				throw new RangeError(`NDJSON record ${recordIndex} exceeds maxLineBytes=${maxLineBytes}`);
			}
		}
		pending += decoder.decode();
	} catch (error) {
		if (error instanceof TypeError && /encoded data|encoding/i.test(error.message)) {
			throw new TypeError(`NDJSON_UTF8_DECODE_FAILED:${error.message}`);
		}
		throw error;
	}

	if (pending.length > 0) {
		const record = processLine(pending);
		if (record) yield record;
	}
}

function parseTypedEvidenceLine<T>(input: {
	artifactRef: string;
	artifactRevision: string;
	line: string;
	recordIndex: number;
	payloadSchema: ZodType<T>;
	payloadSchemaId: string;
}): { result: SimdjsonTypedAdaptResultV1<T>; backend: 'SIMDJSON_NAPI' | 'V8_JSON_PARSE' | 'CACHE' } {
	let record: unknown;
	let backend: 'SIMDJSON_NAPI' | 'V8_JSON_PARSE' | 'CACHE';
	try {
		const parsed = fastJsonParseWithBackend<unknown>(input.line);
		record = parsed.value;
		backend = parsed.backend;
	} catch (error) {
		return {
			backend: 'V8_JSON_PARSE',
			result: {
				status: 'REJECTED',
				recordIndex: input.recordIndex,
				code: 'JSON_PARSE_FAILED',
				reason: `SIMDJSON_TYPED_EVIDENCE_PARSE_FAILED:${error instanceof Error ? error.message : String(error)}`,
			},
		};
	}
	return {
		backend,
		result: adaptSimdjsonTypedEvidence({
			artifactRef: input.artifactRef,
			artifactRevision: input.artifactRevision,
			sourceRef: input.artifactRef,
			sourceRevision: input.artifactRevision,
			evidenceId: `${input.artifactRef}:${input.recordIndex}`,
			rawInputChecksum: createHash('sha256').update(input.line, 'utf8').digest('hex'),
			parserRevision: 'simdjson-parser-bridge:v1',
			recordIndex: input.recordIndex,
			record,
			payloadSchema: input.payloadSchema,
			payloadSchemaId: input.payloadSchemaId,
			adapterRevision: ADAPTER_REVISION,
		}),
	};
}
