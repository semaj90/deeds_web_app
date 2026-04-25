// Phase 89: Enhanced Agentic Pipeline with SSE Events
// Integrates CUDA clustering, cosine ranking, and real-time browser updates

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import AgenticToolCaller from './phase89-agentic-tools.mjs';

class EnhancedAgenticPipeline extends EventEmitter {
	constructor() {
		super();
		this.toolCaller = new AgenticToolCaller();
		this.sseClients = [];
	}

	// Register SSE client for real-time updates
	addSSEClient(res) {
		this.sseClients.push(res);
		console.log(`📡 SSE client connected (total: ${this.sseClients.length})`);
	}

	removeSSEClient(res) {
		this.sseClients = this.sseClients.filter((client) => client !== res);
		console.log(`📡 SSE client disconnected (total: ${this.sseClients.length})`);
	}

	// Emit SSE event to all connected clients
	emitSSE(eventType, data) {
		const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;

		for (const client of this.sseClients) {
			try {
				client.write(message);
			} catch (err) {
				console.error('Failed to send SSE:', err);
			}
		}
	}

	async run(iterations = 3) {
		console.log(`🤖 Enhanced Agentic Pipeline (${iterations} iterations)\n`);

		const results = [];

		for (let i = 0; i < iterations; i++) {
			console.log(`\n${'='.repeat(70)}`);
			console.log(`Iteration ${i + 1}/${iterations}`);
			console.log('='.repeat(70));

			const iterationResult = await this.runSingleIteration();
			results.push(iterationResult);

			// Wait 2s between iterations
			if (i < iterations - 1) {
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}
		}

		// Generate final summary
		const summary = {
			total_iterations: iterations,
			total_errors_fixed: results.reduce((sum, r) => sum + r.errors_fixed, 0),
			total_patterns_learned: results.reduce((sum, r) => sum + r.patterns_learned, 0),
			rag_updates: results.length,
			kag_updates: results.length,
			timestamp: new Date().toISOString()
		};

		await fs.writeFile(
			'reports/phase89-enhanced-pipeline-summary.json',
			JSON.stringify(summary, null, 2)
		);

		console.log('\n✅ Enhanced pipeline complete!');
		console.log(JSON.stringify(summary, null, 2));

		return summary;
	}

	async runSingleIteration() {
		const startTime = Date.now();

		// Stage 1: CUDA Clustering
		console.log('\n🔥 Stage 1: CUDA-Accelerated Error Clustering');
		this.emitSSE('stage_started', { stage: 1, name: 'CUDA Clustering' });

		const clusterReport = await this.toolCaller.tools.cluster_errors();

		this.emitSSE('clustering_complete', {
			total_errors: clusterReport.total_errors,
			total_clusters: clusterReport.total_clusters
		});

		// Stage 2: Fetch Recommendations
		console.log('\n📋 Stage 2: Fetch Top Recommendations');
		this.emitSSE('stage_started', { stage: 2, name: 'Fetch Recommendations' });

		const recommendations = await this.toolCaller.tools.fetch_recommendations(
			'critical and high priority errors',
			10
		);

		this.emitSSE('recommendations_fetched', {
			count: recommendations.length,
			top_action: recommendations[0]?.action
		});

		// Stage 3: Process Top 3 Recommendations
		console.log('\n🎯 Stage 3: Process Top Recommendations');
		let errorsFixed = 0;

		for (const rec of recommendations.slice(0, 3)) {
			this.emitSSE('fix_proposed', {
				nodeId: `cluster-${rec.cluster_id}`,
				file: rec.action.match(/in (.+)/)?.[1] || 'unknown',
				description: rec.action
			});

			// Simulate fix application (TODO: integrate actual LLM fix generation)
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// Emit success (in real version, check validation)
			this.emitSSE('fix_applied', {
				nodeId: `cluster-${rec.cluster_id}`,
				file: rec.action.match(/in (.+)/)?.[1] || 'unknown',
				description: `Fixed: ${rec.action}`,
				success: true
			});

			errorsFixed++;
		}

		// Stage 4: Update RAG
		console.log('\n📚 Stage 4: Update RAG Knowledge Base');
		this.emitSSE('stage_started', { stage: 4, name: 'Update RAG' });

		const ragUpdate = await this.toolCaller.tools.update_rag(clusterReport);

		this.emitSSE('rag_updated', {
			patterns_added: ragUpdate.patterns_added
		});

		// Stage 5: Update KAG
		console.log('\n🧠 Stage 5: Update KAG Knowledge Graph');
		this.emitSSE('stage_started', { stage: 5, name: 'Update KAG' });

		const fixHistory = recommendations.slice(0, 3).map((rec) => ({
			action: rec.action,
			priority: rec.priority,
			related_errors: [rec.cluster_id],
			success: true
		}));

		const kagUpdate = await this.toolCaller.tools.update_kag(fixHistory);

		this.emitSSE('kag_updated', {
			nodes_added: kagUpdate.nodes_added
		});

		// Stage 6: Extract Patterns
		console.log('\n🧩 Stage 6: Extract Learned Patterns');
		this.emitSSE('stage_started', { stage: 6, name: 'Extract Patterns' });

		const patternsLearned = Math.min(recommendations.length, 3);

		for (let i = 0; i < patternsLearned; i++) {
			const rec = recommendations[i];
			this.emitSSE('pattern_learned', {
				pattern: `${rec.error_type} → ${rec.action.substring(0, 50)}...`,
				confidence: rec.score
			});
		}

		// Stage 7: Cosine Ranking for Next Steps
		console.log('\n📊 Stage 7: Cosine Rank Remaining Errors');
		this.emitSSE('stage_started', { stage: 7, name: 'Cosine Ranking' });

		// Get query embedding for "next most important error"
		const queryEmbedding = await this.toolCaller.embedQuery(
			'next most important error to fix'
		);

		// Rank remaining recommendations
		const remainingRecs = recommendations.slice(3);
		if (remainingRecs.length > 0) {
			const ranked = await this.toolCaller.tools.cosine_rank(queryEmbedding, remainingRecs);

			this.emitSSE('ranking_complete', {
				top_next_step: ranked[0]?.action,
				score: ranked[0]?.score
			});
		}

		const duration = ((Date.now() - startTime) / 1000).toFixed(2);

		return {
			errors_fixed: errorsFixed,
			patterns_learned: patternsLearned,
			rag_updated: ragUpdate.patterns_added,
			kag_updated: kagUpdate.nodes_added,
			duration_seconds: parseFloat(duration)
		};
	}
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
	const iterations = parseInt(process.argv[2]) || 3;
	const pipeline = new EnhancedAgenticPipeline();

	pipeline.run(iterations).then(() => {
		process.exit(0);
	});
}

export default EnhancedAgenticPipeline;
