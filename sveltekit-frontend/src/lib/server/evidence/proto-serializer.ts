/**
 * Evidence Metadata Protobuf Serializer
 *
 * Converts evidence analysis results to/from protobuf for:
 * - Compact JSONB storage (base64-encoded proto_bytes field)
 * - gRPC transport
 * - FlatBuffer GPU→CPU zero-copy transfers (separate schema)
 *
 * Generate TS types: pbjs -t static-module -w commonjs -o proto.js evidence_metadata.proto && pbts -o proto.d.ts proto.js
 */

import protobuf from 'protobufjs';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Types (mirrors proto schema) ──────────────────────────────────────────

export interface EvidenceMetadataProto {
	evidenceId: string;
	schemaVersion: number;
	timestamp: number;
	extraction?: ExtractionInfo;
	entities?: Entity[];
	vlm?: VLMAnalysis;
	forensics?: ForensicsResult;
	sections?: LangExtractSection[];
	yolo?: YOLODetections;
	nlp?: NLPClassification;
	suggestedTags?: string[];
	pipelineStats?: AnalysisPipeline;
}

export interface ExtractionInfo {
	method: string;
	textLength: number;
	language?: string;
	ocrFallbackUsed?: boolean;
	resize?: ResizeMetadata;
}

export interface ResizeMetadata {
	resized: boolean;
	originalWidth: number;
	originalHeight: number;
	vlmSize: number;
}

export interface Entity {
	type: string;
	value: string;
	confidence: number;
	startOffset: number;
	endOffset: number;
	source: string;
}

export interface VLMAnalysis {
	summary: string;
	keyFindings: string[];
	suggestedTags: string[];
	model: string;
	cached: boolean;
}

export interface ForensicsResult {
	flags: ForensicFlag[];
	riskScore: number;
}

export interface ForensicFlag {
	type: string;
	description: string;
	severity: string;
	metadata?: Record<string, string>;
}

export interface LangExtractSection {
	sectionType: string;
	confidence: number;
	startOffset: number;
	endOffset: number;
}

export interface YOLODetections {
	objects: YOLOObject[];
	layout?: YOLOLayout;
	modelType: string;
}

export interface YOLOObject {
	className: string;
	confidence: number;
	bbox: BoundingBox;
}

export interface BoundingBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface YOLOLayout {
	detectedLayoutElements: string[];
}

export interface NLPClassification {
	documentType: string;
	practiceArea: string;
	confidence: number;
	keyPhrases: string[];
}

export interface AnalysisPipeline {
	llmEscalated: boolean;
	llmSynthesis?: string;
	graphConnectionsCreated: number;
	yoloCacheHit: boolean;
	cachedToDb: boolean;
	processingTimeMs: number;
}

// ── Protobuf Loader ────────────────────────────────────────────────────────

let root: protobuf.Root | null = null;

function loadProto(): protobuf.Root {
	if (root) return root;

	const protoPath = join(process.cwd(), 'proto', 'active', 'evidence_metadata.proto');
	try {
		const protoContent = readFileSync(protoPath, 'utf-8');
		root = protobuf.parse(protoContent).root;
		return root;
	} catch (err) {
		console.error('[Proto] Failed to load evidence_metadata.proto:', err);
		throw new Error('Protobuf schema not found — run proto codegen');
	}
}

// ── Serialize ──────────────────────────────────────────────────────────────

/**
 * Serialize evidence metadata to protobuf bytes
 */
export function serializeEvidenceMetadata(metadata: EvidenceMetadataProto): Buffer {
	const root = loadProto();
	const EvidenceMetadata = root.lookupType('evidence.EvidenceMetadata');

	// Convert camelCase → snake_case for proto fields
	const payload = {
		evidence_id: metadata.evidenceId,
		schema_version: metadata.schemaVersion,
		timestamp: metadata.timestamp,
		extraction: metadata.extraction ? {
			method: metadata.extraction.method,
			text_length: metadata.extraction.textLength,
			language: metadata.extraction.language,
			ocr_fallback_used: metadata.extraction.ocrFallbackUsed,
			resize: metadata.extraction.resize ? {
				resized: metadata.extraction.resize.resized,
				original_width: metadata.extraction.resize.originalWidth,
				original_height: metadata.extraction.resize.originalHeight,
				vlm_size: metadata.extraction.resize.vlmSize,
			} : undefined,
		} : undefined,
		entities: metadata.entities?.map(e => ({
			type: e.type,
			value: e.value,
			confidence: e.confidence,
			start_offset: e.startOffset,
			end_offset: e.endOffset,
			source: e.source,
		})),
		vlm: metadata.vlm ? {
			summary: metadata.vlm.summary,
			key_findings: metadata.vlm.keyFindings,
			suggested_tags: metadata.vlm.suggestedTags,
			model: metadata.vlm.model,
			cached: metadata.vlm.cached,
		} : undefined,
		forensics: metadata.forensics ? {
			flags: metadata.forensics.flags.map(f => ({
				type: f.type,
				description: f.description,
				severity: f.severity,
				metadata: f.metadata,
			})),
			risk_score: metadata.forensics.riskScore,
		} : undefined,
		sections: metadata.sections?.map(s => ({
			section_type: s.sectionType,
			confidence: s.confidence,
			start_offset: s.startOffset,
			end_offset: s.endOffset,
		})),
		yolo: metadata.yolo ? {
			objects: metadata.yolo.objects.map(o => ({
				class_name: o.className,
				confidence: o.confidence,
				bbox: o.bbox,
			})),
			layout: metadata.yolo.layout ? {
				detected_layout_elements: metadata.yolo.layout.detectedLayoutElements,
			} : undefined,
			model_type: metadata.yolo.modelType,
		} : undefined,
		nlp: metadata.nlp ? {
			document_type: metadata.nlp.documentType,
			practice_area: metadata.nlp.practiceArea,
			confidence: metadata.nlp.confidence,
			key_phrases: metadata.nlp.keyPhrases,
		} : undefined,
		suggested_tags: metadata.suggestedTags,
		pipeline_stats: metadata.pipelineStats ? {
			llm_escalated: metadata.pipelineStats.llmEscalated,
			llm_synthesis: metadata.pipelineStats.llmSynthesis,
			graph_connections_created: metadata.pipelineStats.graphConnectionsCreated,
			yolo_cache_hit: metadata.pipelineStats.yoloCacheHit,
			cached_to_db: metadata.pipelineStats.cachedToDb,
			processing_time_ms: metadata.pipelineStats.processingTimeMs,
		} : undefined,
	};

	const errMsg = EvidenceMetadata.verify(payload);
	if (errMsg) throw new Error(`Protobuf validation failed: ${errMsg}`);

	const message = EvidenceMetadata.create(payload);
	return Buffer.from(EvidenceMetadata.encode(message).finish());
}

/**
 * Serialize evidence metadata to base64 (for JSONB storage)
 */
export function serializeEvidenceMetadataBase64(metadata: EvidenceMetadataProto): string {
	const bytes = serializeEvidenceMetadata(metadata);
	return bytes.toString('base64');
}

// ── Deserialize ────────────────────────────────────────────────────────────

/**
 * Deserialize protobuf bytes to evidence metadata
 */
export function deserializeEvidenceMetadata(bytes: Buffer): EvidenceMetadataProto {
	const root = loadProto();
	const EvidenceMetadata = root.lookupType('evidence.EvidenceMetadata');
	const message = EvidenceMetadata.decode(bytes);
	const obj = EvidenceMetadata.toObject(message, { longs: Number, defaults: false });

	// Convert snake_case → camelCase for TS consumption
	return {
		evidenceId: obj.evidence_id,
		schemaVersion: obj.schema_version,
		timestamp: obj.timestamp,
		extraction: obj.extraction ? {
			method: obj.extraction.method,
			textLength: obj.extraction.text_length,
			language: obj.extraction.language,
			ocrFallbackUsed: obj.extraction.ocr_fallback_used,
			resize: obj.extraction.resize ? {
				resized: obj.extraction.resize.resized,
				originalWidth: obj.extraction.resize.original_width,
				originalHeight: obj.extraction.resize.original_height,
				vlmSize: obj.extraction.resize.vlm_size,
			} : undefined,
		} : undefined,
		entities: obj.entities?.map((e: any) => ({
			type: e.type,
			value: e.value,
			confidence: e.confidence,
			startOffset: e.start_offset,
			endOffset: e.end_offset,
			source: e.source,
		})),
		vlm: obj.vlm ? {
			summary: obj.vlm.summary,
			keyFindings: obj.vlm.key_findings,
			suggestedTags: obj.vlm.suggested_tags,
			model: obj.vlm.model,
			cached: obj.vlm.cached,
		} : undefined,
		forensics: obj.forensics ? {
			flags: obj.forensics.flags.map((f: any) => ({
				type: f.type,
				description: f.description,
				severity: f.severity,
				metadata: f.metadata,
			})),
			riskScore: obj.forensics.risk_score,
		} : undefined,
		sections: obj.sections?.map((s: any) => ({
			sectionType: s.section_type,
			confidence: s.confidence,
			startOffset: s.start_offset,
			endOffset: s.end_offset,
		})),
		yolo: obj.yolo ? {
			objects: obj.yolo.objects.map((o: any) => ({
				className: o.class_name,
				confidence: o.confidence,
				bbox: o.bbox,
			})),
			layout: obj.yolo.layout ? {
				detectedLayoutElements: obj.yolo.layout.detected_layout_elements,
			} : undefined,
			modelType: obj.yolo.model_type,
		} : undefined,
		nlp: obj.nlp ? {
			documentType: obj.nlp.document_type,
			practiceArea: obj.nlp.practice_area,
			confidence: obj.nlp.confidence,
			keyPhrases: obj.nlp.key_phrases,
		} : undefined,
		suggestedTags: obj.suggested_tags,
		pipelineStats: obj.pipeline_stats ? {
			llmEscalated: obj.pipeline_stats.llm_escalated,
			llmSynthesis: obj.pipeline_stats.llm_synthesis,
			graphConnectionsCreated: obj.pipeline_stats.graph_connections_created,
			yoloCacheHit: obj.pipeline_stats.yolo_cache_hit,
			cachedToDb: obj.pipeline_stats.cached_to_db,
			processingTimeMs: obj.pipeline_stats.processing_time_ms,
		} : undefined,
	};
}

/**
 * Deserialize base64-encoded protobuf (from JSONB)
 */
export function deserializeEvidenceMetadataBase64(base64: string): EvidenceMetadataProto {
	const bytes = Buffer.from(base64, 'base64');
	return deserializeEvidenceMetadata(bytes);
}
