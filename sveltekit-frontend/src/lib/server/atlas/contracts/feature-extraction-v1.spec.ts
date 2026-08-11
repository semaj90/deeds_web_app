import { describe, expect, it } from 'vitest';
import {
	DomainClassificationV1Schema,
	FeatureMatrixSetupV1Schema,
	JsonlParsedEvidenceV1Schema,
	PosTaggerOutputV1Schema,
} from './feature-extraction-v1.js';

describe('feature-extraction-v1 contracts', () => {
	it('keeps semantic_768 as the canonical matrix core', () => {
		const setup = FeatureMatrixSetupV1Schema.parse({
			schema_version: 'atlas.feature-extraction.v1',
			kind: 'feature_matrix_setup',
			packet_key: 'packet:1',
			source_ref: 'src/routes/+page.svelte',
			source_revision: 'rev:1',
			workspace_revision: 'workspace:main',
			tree_node_id: 'tree:1',
			title_id: 'title:1',
			representation_id: 'semantic_768',
			representation_revision: 'semantic_768@1',
			semantic_dimension: 768,
			feature_revision: 'feature:1',
			producer_id: 'atlas.feature-extractor',
			producer_revision: 'abc123',
			parser_revision: 'jsonl-parser@1',
			extractor_revision: 'jsonl-extractor@1',
			pos_tagger_revision: 'pos-tagger@1',
			domain_classifier_revision: 'domain-classifier@1',
			graph_revision: 'graph:1',
			jsonl_source_digest: 'sha256:abc',
			feature_tiers: {
				static_packet: {
					enabled: true,
					tensor_name: 'feature_matrix_5',
					representation_id: 'feature_matrix_5',
					width: 5,
					column_names: [
						'authority_norm',
						'domain_fit_base',
						'ast_signal',
						'entropy_norm',
						'execution_utility',
					],
					storage_format: 'feature_matrix_5.arrow',
					presence_mask_required: true,
					source_provenance: {
						workspace_revision: 'workspace:main',
						source_revision: 'rev:1',
						feature_revision: 'feature:1',
					},
				},
				candidate_query: {
					enabled: true,
					tensor_name: 'candidate_feature_matrix',
					width: 25,
					column_names: [
						'semantic_similarity_768',
						'lexical_score',
						'exact_symbol_match',
						'ast_signal',
						'authority_norm',
						'community_fit',
						'domain_fit_query',
						'concept_fit',
						'nary_relation_fit',
						'kmeans_centroid_similarity',
						'kmeans_cluster_rank',
						'som_distance',
						'som_neighbor_radius',
						'hilbert_locality',
						'summary_quality',
						'summary_provenance',
						'recency',
						'retrieval_frequency',
						'execution_utility',
						'graph_distance',
						'process_fit',
						'dependency_fanout',
						'feature_label_confidence',
						'source_revision_match',
						'representation_revision_match',
					],
					ranking_role: 'query_time_rerank',
					top_cluster_soft_cap: 8,
					kmeans_candidates: [64, 128, 256],
					som_grid: [20, 20],
					hilbert_soft_cap: 8,
					exact_knn_top_k: 100,
					rerank_top_k: 64,
				},
				semantic: {
					enabled: true,
					tensor_name: 'semantic_768',
					representation_id: 'semantic_768',
					width: 768,
					source_role: 'canonical_semantic_geometry',
					storage_format: 'semantic_768.arrow',
				},
			},
			derived_heads: {
				pos: {
					enabled: true,
					head_type: 'pytorch',
					max_labels: 8,
				},
				domain: {
					enabled: true,
					head_type: 'pytorch',
					max_labels: 8,
				},
			},
			created_at: '2026-08-11T00:00:00.000Z',
		});

		expect(setup.semantic_dimension).toBe(768);
		expect(setup.representation_id).toBe('semantic_768');
		expect(setup.feature_tiers.static_packet.width).toBe(5);
		expect(setup.feature_tiers.candidate_query.kmeans_candidates).toEqual([64, 128, 256]);
		expect(setup.feature_tiers.candidate_query.som_grid).toEqual([20, 20]);
		expect(setup.feature_tiers.candidate_query.top_cluster_soft_cap).toBe(8);
		expect(setup.derived_heads.pos.max_labels).toBe(8);
		expect(setup.derived_heads.domain.max_labels).toBe(8);
	});

	it('parses JSONL evidence with explicit provenance', () => {
		const parsed = JsonlParsedEvidenceV1Schema.parse({
			schema_version: 'atlas.feature-extraction.v1',
			kind: 'jsonl_parsed_evidence',
			packet_key: 'packet:1',
			source_ref: 'docs/reports/graphify-task-candidates.jsonl',
			source_revision: 'rev:1',
			workspace_revision: 'workspace:main',
			parser_revision: 'jsonl-parser@1',
			record_index: 0,
			line_number: 12,
			raw_json: { kind: 'task_candidate', title: 'Build extractor' },
			content_hash: 'sha256:deadbeef',
			created_at: '2026-08-11T00:00:00.000Z',
		});

		expect(parsed.packet_key).toBe('packet:1');
		expect(parsed.raw_json).toMatchObject({ kind: 'task_candidate' });
	});

	it('caps the POS tagger head at eight candidate labels', () => {
		const pos = PosTaggerOutputV1Schema.parse({
			schema_version: 'atlas.feature-extraction.v1',
			kind: 'pos_tagger_output',
			packet_key: 'packet:1',
			source_ref: 'src/routes/+page.svelte',
			source_revision: 'rev:1',
			tree_node_id: 'tree:1',
			title_id: 'title:1',
			representation_id: 'semantic_768',
			representation_revision: 'semantic_768@1',
			producer_id: 'atlas.pos-tagger',
			producer_revision: 'pytorch:1',
			model_revision: 'pos-head@1',
			head_type: 'pytorch',
			token_index: 4,
			surface: 'Cache',
			part_of_speech: 'NOUN',
			confidence: 0.91,
			top_k_labels: [
				{ label: 'NOUN', score: 0.91 },
				{ label: 'PROPN', score: 0.08 },
			],
			evidence_refs: ['evidence:1'],
			created_at: '2026-08-11T00:00:00.000Z',
		});

		expect(pos.representation_id).toBe('semantic_768');
		expect(pos.top_k_labels).toHaveLength(2);
		expect(() =>
			PosTaggerOutputV1Schema.parse({
				...pos,
				top_k_labels: Array.from({ length: 9 }, (_, index) => ({
					label: `TAG_${index}`,
					score: 0.1,
				})),
			}),
		).toThrow();
	});

	it('re-exports the semantic signal domain classification schema for runtime callers', () => {
		const parsed = DomainClassificationV1Schema.parse({
			schema_version: 'atlas.semantic_signal.v1',
			signal_type: 'domain_classification',
			subject_id: 'packet:1',
			workspace_revision: 'workspace:main',
			producer: 'atlas.domain-classifier',
			producer_revision: '1',
			evidence_refs: [
				{
					source_ref: 'src/routes/+page.svelte',
					content_hash: 'sha256:abc',
					packet_key: 'packet:1',
					tree_node_id: 'tree:1',
					evidence_kind: 'pos',
					note: 'unit-test',
				},
			],
			labels: [{ label: 'frontend', score: 0.9, source: 'deterministic', evidence_kinds: ['pos'] }],
			primary_label: 'frontend',
			secondary_labels: ['ui'],
			confidence: 0.9,
			model_revision_state: 'NOT_PROVEN',
			created_at: '2026-08-11T00:00:00.000Z',
		});

		expect(parsed.primary_label).toBe('frontend');
	});
});
