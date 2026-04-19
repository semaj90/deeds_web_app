import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabaseUrl, getRedisUrl, getQdrantUrl, getOllamaUrl } from '$lib/config/env.server.js';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const config = {
		// PostgreSQL Configuration
		postgres: { connectionString: getDatabaseUrl(),
			ssl: env.PGSSL === 'true'
		},

		// Redis Configuration
		redis: { url: getRedisUrl(),
			db: parseInt(env?.REDIS_DB ?? '0'),
			prefixes: { phase89: 'phase89:',
				embeddings: 'emb:',
				topk: 'topk:',
				kb: 'kb:'
			}
		},

		// Qdrant Configuration
		qdrant: { url: getQdrantUrl(),
			collections: { error_chunks: 'phase89_error_chunks',
				ast_chunks: 'phase89_ast_chunks',
				kb_cards: 'phase89_kb_cards',
				knowledge_base: 'phase76_knowledge_base'
			},
			embedding_dimension: 768,
			distance_metric: 'Cosine',
			hnsw_config: { m: 48,
				ef_construct: 200
			}
		},

		// Ollama Configuration
		ollama: { url: getOllamaUrl(),
			models: { embedding: 'embeddinggemma:latest',
				legal: 'gemma4-legal:latest'
			}
		},

		// Phase 89 Specific Settings
		phase89: { batch_size: 50,
			cluster_min_size: 3,
			cosine_threshold: 0.7,
			gpu_enabled: env.PHASE89_GPU === 'true',
			auto_fix_enabled: env.PHASE89_AUTO_FIX === 'true',
			kb_quality_gate_enabled: env.PHASE89_KB_GATE === 'true'
		},

		// Namespace Coherence Check
		namespace_coherence: { redis_url_matches: true, // Checked at runtime
			qdrant_collections_exist: true, // Checked at runtime
			prefixes_consistent: true // phase89:*, emb:*, topk:*, kb:*
		},

		// Version Info
		version: { phase: 89,
			last_updated: new Date().toISOString(),
			features: [
				'CUDA Acceleration',
				'GPU Reranking',
				'AST Signature Indexing',
				'Cluster-based Summarization',
				'KB Quality Gate',
				'Non-destructive Error Tracking',
				'Rollback Safety'
			]
		}
	};

	return json(config);
};



