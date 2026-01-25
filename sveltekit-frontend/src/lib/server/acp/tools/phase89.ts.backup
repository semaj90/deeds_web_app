/**
 * Phase 89: Enhanced ACP Tools
 * Registers Phase 89 GPU-accelerated tools with the ACP registry
 */

import { spawn } from 'child_process';
import path from 'path';

export const phase89Tools = {
	/**
	 * Tool: phase89:cluster
	 * Run GPU-accelerated CUDA clustering on error embeddings
	 */
	'phase89:cluster': {
		name: 'phase89:cluster',
		description: 'Run multi-core CUDA clustering on error embeddings with Redis caching',
		category: 'machine-learning',
		inputSchema: {
			type: 'object',
			properties: {
				eps: {
					type: 'number',
					description: 'DBSCAN epsilon parameter (distance threshold)',
					default: 0.3
				},
				minSamples: {
					type: 'number',
					description: 'Minimum samples per cluster',
					default: 2
				},
				batchSize: {
					type: 'number',
					description: 'Batch size for GPU processing',
					default: 1000
				}
			}
		},
		outputSchema: {
			type: 'object',
			properties: {
				clusters: { type: 'number', description: 'Number of clusters found' },
				embeddings_processed: { type: 'number' },
				cache_hits: { type: 'number' },
				gpu_memory_used: { type: 'string' }
			}
		},
		execute: async (args: any) => {
			const { eps = 0.3, minSamples = 2, batchSize = 1000 } = args;

			return new Promise((resolve, reject) => {
                // Use environment variable or fallback to default path
				const pythonPath = process.env.PHASE72_PYTHON || 'C:\\Users\\james\\Videos\\deeds-web-app\\.venv\\Scripts\\python.exe';
				const scriptPath = path.join(process.cwd(), 'scripts', 'phase89-cuda-multicore.py');

				const proc = spawn(pythonPath, [scriptPath], {
					env: {
						...process.env,
						PHASE89_EPS: eps.toString(),
                        PHASE89_MIN_SAMPLES: minSamples.toString(),
                        PHASE89_BATCH_SIZE: batchSize.toString()
					}
				});

				let stdout = '';
				let stderr = '';

				proc.stdout.on('data', (data) => {
					stdout += data.toString();
				});

				proc.stderr.on('data', (data) => {
					stderr += data.toString();
				});

				proc.on('close', (code) => {
					if (code === 0) {
						// Parse output for statistics
						const clusterMatch = stdout.match(/Total Clusters:\s*(\d+)/);
						const embeddingsMatch = stdout.match(/(\d+)\s+valid embeddings/);
						const cacheHitsMatch = stdout.match(/Cache Hits:\s*(\d+)/);
						const gpuMemMatch = stdout.match(/GPU Memory Used:\s*([\d.]+\s*GB)/);

						resolve({
							success: true,
							clusters: clusterMatch ? parseInt(clusterMatch[1]) : 0,
							embeddings_processed: embeddingsMatch ? parseInt(embeddingsMatch[1]) : 0,
							cache_hits: cacheHitsMatch ? parseInt(cacheHitsMatch[1]) : 0,
							gpu_memory_used: gpuMemMatch ? gpuMemMatch[1] : 'N/A',
							output: stdout
						});
					} else {
						reject(new Error(`Clustering failed with code ${code}, ${stderr}`));
					}
				});
			});
		}
	},

	/**
	 * Tool: phase89:summarize
	 * Generate LLM summaries for error clusters
	 */
	'phase89:summarize': {
		name: 'phase89:summarize',
		description: 'Generate LLM summaries for CUDA clusters and store in KB cards',
		category: 'knowledge-management',
		inputSchema: {
			type: 'object',
			properties: {
				clusterIds: {
					type: 'array',
					items: { type: 'number' },
					description: 'Specific cluster IDs to summarize (optional - summarizes all if empty)'
				}
			}
		},
		outputSchema: {
			type: 'object',
			properties: {
				summaries_generated: { type: 'number' },
				kb_cards_created: { type: 'number' },
				copilot_md_updated: { type: 'boolean' }
			}
		},
		execute: async (args: any) => {
			const { clusterIds = [] } = args;

			return new Promise((resolve, reject) => {
				const scriptPath = path.join(process.cwd(), 'scripts', 'phase89-llm-summarizer.mjs');

				const proc = spawn('node', [scriptPath], {
					env: {
						...process.env,
						PHASE89_CLUSTER_IDS: JSON.stringify(clusterIds)
					}
				});

				let stdout = '';
				let stderr = '';

				proc.stdout.on('data', (data) => {
					stdout += data.toString();
				});

				proc.stderr.on('data', (data) => {
					stderr += data.toString();
				});

				proc.on('close', (code) => {
					if (code === 0) {
						const processedMatch = stdout.match(/Processed:\s*(\d+)\/(\d+)/);

						resolve({
							success: true,
							summaries_generated: processedMatch ? parseInt(processedMatch[1]) : 0,
							kb_cards_created: processedMatch ? parseInt(processedMatch[1]) : 0,
							copilot_md_updated: stdout.includes('copilot.md'),
                            output: stdout
						});
					} else {
						reject(new Error(`Summarization failed with code ${code}, ${stderr}`));
					}
				});
			});
		}
	},

	/**
	 * Tool: phase89:tag
	 * Auto-tag Qdrant collections using ripgrep
	 */
	'phase89:tag': {
		name: 'phase89:tag',
		description: 'Auto-tag Qdrant points with file metadata extracted via ripgrep',
		category: 'indexing',
		inputSchema: {
			type: 'object',
			properties: {
				collections: {
					type: 'array',
					items: { type: 'string' },
					description: 'Collections to tag (optional - tags all Phase 89 collections if empty)'
				},
				showStats: {
					type: 'boolean',
					description: 'Show tag statistics after tagging',
					default: false
				}
			}
		},
		outputSchema: {
			type: 'object',
			properties: {
				points_tagged: { type: 'number' },
				collections_processed: { type: 'number' },
				tag_statistics: { type: 'object' }
			}
		},
		execute: async (args: any) => {
			const { collections = [], showStats = false } = args;

			return new Promise((resolve, reject) => {
				const scriptPath = path.join(process.cwd(), 'scripts', 'phase89-ripgrep-tagger.mjs');
				const nodeArgs = [scriptPath];

				if (showStats) {
					nodeArgs.push('--stats');
					if (collections.length > 0) {
						nodeArgs.push(collections[0]);
					}
				}

				const proc = spawn('node', nodeArgs);

				let stdout = '';
				let stderr = '';

				proc.stdout.on('data', (data) => {
					stdout += data.toString();
				});

				proc.stderr.on('data', (data) => {
					stderr += data.toString();
				});

				proc.on('close', (code) => {
					if (code === 0) {
						const taggedMatch = stdout.match(/Tagged\s+(\d+)\s+points/);
						const collectionsMatch = stdout.matchAll(/Tagged\s+\d+\s+points in\s+(\S+)/g);
						const collectionCount = [...collectionsMatch].length;

						resolve({
							success: true,
							points_tagged: taggedMatch ? parseInt(taggedMatch[1]) : 0,
							collections_processed: collectionCount,
							tag_statistics: showStats ? stdout : null,
							output: stdout
						});
					} else {
						reject(new Error(`Tagging failed with code ${code}, ${stderr}`));
					}
				});
			});
		}
	},

	/**
	 * Tool: phase89:pipeline
	 * Run full Phase 89 pipeline: cluster → summarize → tag
	 */
	'phase89:pipeline': {
		name: 'phase89:pipeline',
		description: 'Run complete Phase 89 pipeline: CUDA clustering: LLM summarization, and auto-tagging',
		category: 'orchestration',
		inputSchema: {
			type: 'object',
			properties: {
				skipClustering: { type: 'boolean', default: false },
				skipSummarization: { type: 'boolean', default: false },
				skipTagging: { type: 'boolean', default: false }
			}
		},
		outputSchema: {
			type: 'object',
			properties: {
				pipeline_stages: { type: 'array', items: { type: 'string' } },
				total_duration_ms: { type: 'number' },
				results: { type: 'object' }
			}
		},
		execute: async (args: any) => {
			const { skipClustering = false, skipSummarization = false, skipTagging = false } = args;

			const startTime = Date.now();
			const results: Record<string, any> = {};
			const stages: string[] = [];

			try {
				// Stage 1: CUDA Clustering
				if (!skipClustering) {
					console.log('🔬 Stage 1: CUDA Clustering...');
                    // Use type assertion for dynamic index since TS doesn't know about phase89Tools at runtime in this context
					results.clustering = await (phase89Tools['phase89:cluster'] as any).execute({});
					stages.push('clustering');
				}

				// Stage 2: LLM Summarization
				if (!skipSummarization) {
					console.log('🧠 Stage 2: LLM Summarization...');
					results.summarization = await (phase89Tools['phase89:summarize'] as any).execute({});
					stages.push('summarization');
				}

				// Stage 3: Auto-Tagging
				if (!skipTagging) {
					console.log('🏷️  Stage 3: Auto-Tagging...');
					results.tagging = await (phase89Tools['phase89:tag'] as any).execute({});
					stages.push('tagging');
				}

				const duration = Date.now() - startTime;

				return {
					success: true,
					pipeline_stages: stages,
					total_duration_ms: duration,
					results
				};
			} catch (err: any) {
				throw new Error(`Pipeline failed at stage ${stages.length + 1}, ${err.message}`);
			}
		}
	}
};

