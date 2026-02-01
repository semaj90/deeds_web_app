
/**
 * SORA Graph Traversal System
 * High-performance graph traversal with Neo4j integration + reinforcement learning
 * Supports GPU-accelerated similarity scoring and legal AI reranking
 */

// Optional integration types
type NESGPUIntegration = {
	computeBatchSimilarities?: (data: Float32Array[]) => Promise<number[]>;
};

type NESMemoryArchitecture = {
	allocateCHR_ROM?: (size: number) => any;
	writeCHR_ROM?: (region: unknown, data: any) => void;
};

type SemanticAnalysisPipeline = {
	processDocument: (content: string) => Promise<any>;
	extractEntities: (content: string) => Promise<string[]>;
	generateEmbedding?: (text: string) => Promise<Float32Array>;
};

type DimensionalTensorStore = {
	storeTensorSlice?: (slice: TensorSlice) => Promise<void>;
	getStats?: () => any;
};

type LegalAIReranker = {
	rerank: (results: any[], context: UserContext) => Promise<any[]>;
};

type TensorSlice = {
	data: Float32Array;
	dimensions: number[];
	axis?: number;
	index?: number;
	lodLevel?: number;
	metadata?: {
		timestamp: number;
		hash: string;
		size: number;
		accessCount: number;
		lastAccessed: number;
	};
};

type UserContext = {
	userId?: string;
	preferences?: unknown;
	intent?: 'search' | 'analyze' | 'create' | 'navigate';
	timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
	userRole?: string;
	workflowState?: string;
	recentActions?: any[];
	currentCase?: unknown;
};

// Exported interfaces

export interface SoraGraphNode {
	id: string;
	type: 'document' | 'entity' | 'concept' | 'relationship' | 'case' | 'evidence';
	properties: Record<string, unknown>;
	embedding?: Float32Array;
	coordinates?: { x: number; y: number; z: number };
	score?: number;
	depth?: number;
}

export interface SoraGraphEdge {
	id: string;
	source: string;
	target: string;
	type: 'cites' | 'contains' | 'related' | 'similar' | 'references' | 'contradicts';
	weight: number;
	properties: Record<string, any>;
}

export interface SoraTraversalPath {
	nodes: SoraGraphNode[];
	edges: SoraGraphEdge[];
	totalScore: number;
	pathLength: number;
	semanticCoherence: number;
}

export interface SoraTraversalOptions {
	maxDepth: number;
	maxNodes: number;
	scoreThreshold: number;
	traversalStrategy: 'breadth-first' | 'depth-first' | 'best-first' | 'reinforcement';
	semanticFiltering: boolean;
	useGPUAcceleration: boolean;
	reinforcementLearning: {
		enabled: boolean;
		explorationRate: number;
		learningRate: number;
		discountFactor: number;
	};
}

export interface SoraReinforcementState {
	currentNode: string;
	visitedNodes: Set<string>;
	pathHistory: string[];
	cumulativeReward: number;
	actionValues: Map<string, number>;
}

/**
 * Main graph traversal class with reinforcement learning support
 */
export class SoraGraphTraversal {
	private neo4jDriver: any;
	private gpuIntegration: NESGPUIntegration | null = null;
	private memoryArch: NESMemoryArchitecture | null = null;
	private semanticPipeline: SemanticAnalysisPipeline | null = null;
	private tensorStore: DimensionalTensorStore | null = null;
	private reranker: LegalAIReranker | null = null;

	// Caches for performance
	private traversalCache: Map<string, SoraTraversalPath[]> = new Map();
	private reinforcementModel: Map<string, number> = new Map();

	constructor(
		neo4jDriver: any,
		gpuIntegration?: NESGPUIntegration,
		memoryArch?: NESMemoryArchitecture,
		semanticPipeline?: SemanticAnalysisPipeline,
		tensorStore?: DimensionalTensorStore,
		reranker?: LegalAIReranker
	) {
		this.neo4jDriver = neo4jDriver;
		this.gpuIntegration = gpuIntegration ?? null;
		this.memoryArch = memoryArch ?? null;
		this.semanticPipeline = semanticPipeline ?? null;
		this.tensorStore = tensorStore ?? null;
		this.reranker = reranker ?? null;
	}

	/**
	 * Main traversal entry point with caching and RL support
	 */
	async traverseGraph(
		startNodeId: string,
		query: string,
		options: Partial<SoraTraversalOptions> = {}
	): Promise<SoraTraversalPath[]> {
		const config: SoraTraversalOptions = {
			maxDepth: 5,
			maxNodes: 100,
			scoreThreshold: 0.6,
			traversalStrategy: 'reinforcement',
			semanticFiltering: true,
			useGPUAcceleration: true,
			reinforcementLearning: {
				enabled: true,
				explorationRate: 0.1,
				learningRate: 0.01,
				discountFactor: 0.95
			},
			...options
		};

		// Check cache
		const cacheKey = `${startNodeId}_${query}_${JSON.stringify(config)}`;
		if (this.traversalCache.has(cacheKey)) {
			return this.traversalCache.get(cacheKey)!;
		}

		// Generate query embedding for semantic filtering
		const queryEmbedding = this.semanticPipeline?.generateEmbedding
			? await this.semanticPipeline.generateEmbedding(query)
			: new Float32Array(384);

		// Execute traversal strategy
		let paths: SoraTraversalPath[] = [];

		switch (config.traversalStrategy) {
			case 'reinforcement':
				paths = await this.reinforcementTraversal(startNodeId, queryEmbedding, config);
				break;
			case 'best-first':
				paths = await this.bestFirstTraversal(startNodeId, queryEmbedding, config);
				break;
			case 'depth-first':
				paths = await this.depthFirstTraversal(startNodeId, queryEmbedding, config);
				break;
			case 'breadth-first':
			default:
				paths = await this.breadthFirstTraversal(startNodeId, queryEmbedding, config);
				break;
		}

		// GPU-accelerated scoring if enabled
		if (config.useGPUAcceleration && paths.length > 0) {
			paths = await this.gpuEnhancedScoring(paths, queryEmbedding);
		}

		// Legal AI reranking for improved relevance
		if (paths.length > 1) {
			paths = await this.applyLegalReranking(paths, query, config);
		}

		// Store tensor data for future analysis
		await this.storeTensorData(paths, queryEmbedding, config);

		// Cache and return
		this.traversalCache.set(cacheKey, paths);
		return paths;
	}

	/**
	 * Reinforcement learning traversal using Q-learning
	 */
	private async reinforcementTraversal(
		startNodeId: string,
		queryEmbedding: Float32Array,
		config: SoraTraversalOptions
	): Promise<SoraTraversalPath[]> {
		const paths: SoraTraversalPath[] = [];
		const startNode = await this.getNodeById(startNodeId);
		if (!startNode) return paths;

		// Q-learning table: state -> action -> Q-value
		const qTable = new Map<string, Map<string, number>>();

		// Run multiple episodes to learn optimal paths
		for (let episode = 0; episode < 10; episode++) {
			const episodePath = await this.runReinforcementEpisode(
				startNode,
				queryEmbedding,
				config,
				qTable
			);

			if (episodePath.nodes.length > 1) {
				paths.push(episodePath);
			}
		}

		return this.selectBestPaths(paths, 5);
	}

	/**
	 * Single RL episode using epsilon-greedy exploration
	 */
	private async runReinforcementEpisode(
		startNode: SoraGraphNode,
		queryEmbedding: Float32Array,
		config: SoraTraversalOptions,
		qTable: Map<string, Map<string, number>>
	): Promise<SoraTraversalPath> {
		const path: SoraTraversalPath = {
			nodes: [startNode],
			edges: [],
			totalScore: 0,
			pathLength: 0,
			semanticCoherence: 0
		};

		let currentNode = startNode;
		const visitedNodes = new Set([startNode.id]);

		for (let depth = 0; depth < config.maxDepth; depth++) {
			const neighbors = await this.getNeighbors(currentNode.id);
			if (neighbors.length === 0) break;

			const unvisitedNeighbors = neighbors.filter(n => !visitedNodes.has(n.target.id));
			if (unvisitedNeighbors.length === 0) break;

			// Epsilon-greedy: explore vs exploit
			let selectedAction;
			if (Math.random() < config.reinforcementLearning.explorationRate) {
				selectedAction = unvisitedNeighbors[Math.floor(Math.random() * unvisitedNeighbors.length)];
			} else {
				selectedAction = await this.selectBestAction(
					currentNode.id,
					unvisitedNeighbors,
					qTable,
					queryEmbedding
				);
			}

			// Calculate reward and update Q-table
			const reward = await this.calculateReward(currentNode, selectedAction.target, queryEmbedding);
			this.updateQTable(currentNode.id, selectedAction.target.id, reward, config, qTable);

			// Move to next node
			path.nodes.push(selectedAction.target);
			path.edges.push(selectedAction.edge);
			visitedNodes.add(selectedAction.target.id);
			currentNode = selectedAction.target;

			path.totalScore += reward;
			path.pathLength++;
		}

		path.semanticCoherence = await this.calculatePathSemanticCoherence(path, queryEmbedding);
		return path;
	}

	/**
	 * Q-learning update: Q(s,a) = Q(s,a) + α[r + γ*max(Q(s',a')) - Q(s,a)]
	 */
	private updateQTable(
		stateId: string,
		actionId: string,
		reward: number,
		config: SoraTraversalOptions,
		qTable: Map<string, Map<string, number>>
	): void {
		if (!qTable.has(stateId)) {
			qTable.set(stateId, new Map());
		}

		const stateActions = qTable.get(stateId)!;
		const currentQ = stateActions.get(actionId) ?? 0;

		const newQ =
			currentQ +
			config.reinforcementLearning.learningRate *
				(reward + config.reinforcementLearning.discountFactor * this.getMaxQValue(actionId, qTable) - currentQ);

		stateActions.set(actionId, newQ);
	}

	private getMaxQValue(stateId: string, qTable: Map<string, Map<string, number>>): number {
		const stateActions = qTable.get(stateId);
		if (!stateActions || stateActions.size === 0) return 0;
		return Math.max(...Array.from(stateActions.values()));
	}

	/**
	 * Calculate reward: semantic similarity + node type bonus + novelty
	 */
	private async calculateReward(
		fromNode: SoraGraphNode,
		toNode: SoraGraphNode,
		queryEmbedding: Float32Array
	): Promise<number> {
		let reward = 0;

		// Semantic similarity
		if (toNode.embedding) {
			const similarity = this.cosineSimilarity(queryEmbedding, toNode.embedding);
			reward += similarity * 10;
		}

		// Node type bonus
		const typeBonus: Record<string, number> = {
			document: 1,
			evidence: 4,
			case: 2,
			entity: 1,
			concept: 1,
			relationship: 0.5
		};
		reward += typeBonus[toNode.type] ?? 0;

		// Novelty bonus (encourage exploration)
		const visitCount = this.reinforcementModel.get(toNode.id) ?? 0;
		reward += Math.max(0, 2 - visitCount * 0.1);

		this.reinforcementModel.set(toNode.id, visitCount + 1);
		return reward;
	}

	/**
	 * Select best action using Q-values
	 */
	private async selectBestAction(
		stateId: string,
		actions: Array<{ target: SoraGraphNode; edge: SoraGraphEdge }>,
		qTable: Map<string, Map<string, number>>,
		queryEmbedding: Float32Array
	): Promise<{ target: SoraGraphNode; edge: SoraGraphEdge }> {
		const stateActions = qTable.get(stateId);
		if (!stateActions) {
			return this.heuristicActionSelection(actions, queryEmbedding);
		}

		let bestAction = actions[0];
		let bestValue = -Infinity;

		for (const action of actions) {
			const qValue = stateActions.get(action.target.id) ?? 0;
			if (qValue > bestValue) {
				bestValue = qValue;
				bestAction = action;
			}
		}

		return bestAction;
	}

	/**
	 * Heuristic selection for unexplored states
	 */
	private async heuristicActionSelection(
		actions: Array<{ target: SoraGraphNode; edge: SoraGraphEdge }>,
		queryEmbedding: Float32Array
	): Promise<{ target: SoraGraphNode; edge: SoraGraphEdge }> {
		let bestAction = actions[0];
		let bestScore = -1;

		for (const action of actions) {
			let score = 0;

			// Semantic similarity
			if (action.target.embedding) {
				score += this.cosineSimilarity(queryEmbedding, action.target.embedding) * 0.6;
			}

			// Edge weight
			score += action.edge.weight * 0.2;

			// Node type preference
			const typeScore: Record<string, number> = {
				evidence: 0.8,
				case: 0.7,
				document: 0.6,
				entity: 0.4,
				concept: 0.3,
				relationship: 0.2
			};
			score += (typeScore[action.target.type] ?? 0) * 0.2;

			if (score > bestScore) {
				bestScore = score;
				bestAction = action;
			}
		}

		return bestAction;
	}

	/**
	 * Best-first traversal (priority queue by score)
	 */
	private async bestFirstTraversal(
		startNodeId: string,
		queryEmbedding: Float32Array,
		config: SoraTraversalOptions
	): Promise<SoraTraversalPath[]> {
		const paths: SoraTraversalPath[] = [];
		const startNode = await this.getNodeById(startNodeId);
		if (!startNode) return paths;

		const priorityQueue: Array<{
			node: SoraGraphNode;
			path: SoraGraphNode[];
			edges: SoraGraphEdge[];
			score: number;
		}> = [];

		priorityQueue.push({
			node: startNode,
			path: [startNode],
			edges: [],
			score: this.calculateNodeScore(startNode, queryEmbedding)
		});

		const visited = new Set<string>();

		while (priorityQueue.length > 0 && paths.length < 10) {
			priorityQueue.sort((a, b) => b.score - a.score);
			const current = priorityQueue.shift()!;

			if (visited.has(current.node.id)) continue;
			visited.add(current.node.id);

			if (current.path.length > 1 && current.score >= config.scoreThreshold) {
				const pathCoherence = await this.calculatePathSemanticCoherence(
					{
						nodes: current.path,
						edges: current.edges,
						totalScore: current.score,
						pathLength: current.path.length,
						semanticCoherence: 0
					},
					queryEmbedding
				);

				paths.push({
					nodes: current.path,
					edges: current.edges,
					totalScore: current.score,
					pathLength: current.path.length,
					semanticCoherence: pathCoherence
				});
			}

			if (current.path.length < config.maxDepth) {
				const neighbors = await this.getNeighbors(current.node.id);
				for (const neighbor of neighbors) {
					if (!visited.has(neighbor.target.id) && !current.path.some(n => n.id === neighbor.target.id)) {
						const nodeScore = this.calculateNodeScore(neighbor.target, queryEmbedding);
						const pathScore = current.score + nodeScore * (1 - current.path.length * 0.1);

						priorityQueue.push({
							node: neighbor.target,
							path: [...current.path, neighbor.target],
							edges: [...current.edges, neighbor.edge],
							score: pathScore
						});
					}
				}
			}
		}

		return this.selectBestPaths(paths, 5);
	}

	/**
	 * GPU-accelerated batch similarity scoring
	 */
	private async gpuEnhancedScoring(
		paths: SoraTraversalPath[],
		queryEmbedding: Float32Array
	): Promise<SoraTraversalPath[]> {
		try {
			const allEmbeddings: Float32Array[] = [];
			const nodeIndices: number[] = [];

			paths.forEach((path, pathIndex) => {
				path.nodes.forEach((node, nodeIndex) => {
					if (node.embedding) {
						allEmbeddings.push(node.embedding);
						nodeIndices.push(pathIndex * 1000 + nodeIndex);
					}
				});
			});

			if (allEmbeddings.length > 0) {
				const similarities = this.gpuIntegration?.computeBatchSimilarities
					? await this.gpuIntegration.computeBatchSimilarities(allEmbeddings)
					: allEmbeddings.map(emb => this.cosineSimilarity(queryEmbedding, emb));

				similarities.forEach((similarity, index) => {
					const encodedIndex = nodeIndices[index];
					const pathIndex = Math.floor(encodedIndex / 1000);
					const nodeIndex = encodedIndex % 1000;

					if (paths[pathIndex]?.nodes[nodeIndex]) {
						paths[pathIndex].nodes[nodeIndex].score = similarity;
					}
				});

				paths.forEach(path => {
					const avgNodeScore = path.nodes.reduce((sum, node) => sum + (node.score ?? 0), 0) / path.nodes.length;
					path.totalScore = avgNodeScore * path.semanticCoherence;
				});
			}

			return paths.sort((a, b) => b.totalScore - a.totalScore);
		} catch (error) {
			console.warn('GPU scoring failed, using CPU fallback:', error);
			return paths;
		}
	}

	/**
	 * Query Neo4j for node by ID
	 */
	private async getNodeById(nodeId: string): Promise<SoraGraphNode | null> {
		try {
			const session = this.neo4jDriver.session();
			try {
				const result = await session.run(
					'MATCH (n) WHERE id(n) = $nodeId RETURN n, labels(n) as labels',
					{ nodeId: parseInt(nodeId) }
				);

				if (result.records.length === 0) return null;

				const record = result.records[0];
				const node = record.get('n');
				const labels = record.get('labels');

				return {
					id: nodeId,
					type: this.mapLabelsToType(labels),
					properties: node.properties,
					embedding: node.properties.embedding ? new Float32Array(node.properties.embedding) : undefined,
					coordinates: node.properties.coordinates
						? {
								x: node.properties.coordinates.x,
								y: node.properties.coordinates.y,
								z: node.properties.coordinates.z ?? 0
						  }
						: undefined
				};
			} finally {
				await session.close();
			}
		} catch (error) {
			console.error('Error getting node by ID:', error);
			return null;
		}
	}

	/**
	 * Query Neo4j for node neighbors
	 */
	private async getNeighbors(
		nodeId: string
	): Promise<Array<{ target: SoraGraphNode; edge: SoraGraphEdge }>> {
		try {
			const session = this.neo4jDriver.session();
			try {
				const result = await session.run(
					`
					MATCH (n)-[r]-(m)
					WHERE id(n) = $nodeId
					RETURN m, r, labels(m) as target_labels, type(r) as rel_type
					ORDER BY r.weight DESC
					LIMIT 20
				`,
					{ nodeId: parseInt(nodeId) }
				);

				const neighbors: Array<{ target: SoraGraphNode; edge: SoraGraphEdge }> = [];

				for (const record of result.records) {
					const targetNode = record.get('m');
					const relationship = record.get('r');
					const targetLabels = record.get('target_labels');
					const relType = record.get('rel_type');

					const target: SoraGraphNode = {
						id: targetNode.identity.toString(),
						type: this.mapLabelsToType(targetLabels),
						properties: targetNode.properties,
						embedding: targetNode.properties.embedding
							? new Float32Array(targetNode.properties.embedding)
							: undefined
					};

					const edge: SoraGraphEdge = {
						id: relationship.identity.toString(),
						source: nodeId,
						target: target.id,
						type: this.mapRelationshipType(relType),
						weight: relationship.properties?.weight ?? 1,
						properties: relationship.properties
					};

					neighbors.push({ target, edge });
				}

				return neighbors;
			} finally {
				await session.close();
			}
		} catch (error) {
			console.error('Error getting neighbors:', error);
			return [];
		}
	}

	private calculateNodeScore(node: SoraGraphNode, queryEmbedding: Float32Array): number {
		let score = 0;

		if (node.embedding) {
			score += this.cosineSimilarity(queryEmbedding, node.embedding) * 0.7;
		}

		const typeWeights: Record<string, number> = {
			evidence: 1.0,
			case: 0.9,
			document: 0.8,
			entity: 0.6,
			concept: 0.5,
			relationship: 0.3
		};
		score += (typeWeights[node.type] ?? 0.1) * 0.3;

		return Math.max(0, Math.min(1, score));
	}

	private async calculatePathSemanticCoherence(
		path: SoraTraversalPath,
		queryEmbedding: Float32Array
	): Promise<number> {
		if (path.nodes.length < 2) return 0;

		let totalCoherence = 0;
		let comparisons = 0;

		// Pairwise similarity between consecutive nodes
		for (let i = 0; i < path.nodes.length - 1; i++) {
			const node1 = path.nodes[i];
			const node2 = path.nodes[i + 1];
			if (node1.embedding && node2.embedding) {
				totalCoherence += this.cosineSimilarity(node1.embedding, node2.embedding);
				comparisons++;
			}
		}

		// Average similarity to query
		let queryCoherence = 0;
		let queryComparisons = 0;

		for (const node of path.nodes) {
			if (node.embedding) {
				queryCoherence += this.cosineSimilarity(queryEmbedding, node.embedding);
				queryComparisons++;
			}
		}

		const avgPathCoherence = comparisons > 0 ? totalCoherence / comparisons : 0;
		const avgQueryCoherence = queryComparisons > 0 ? queryCoherence / queryComparisons : 0;

		return avgPathCoherence * 0.4 + avgQueryCoherence * 0.6;
	}

	private selectBestPaths(paths: SoraTraversalPath[], limit: number): SoraTraversalPath[] {
		// Sort by combined score
		paths.sort((a, b) => {
			const scoreA = a.totalScore * 0.4 + a.semanticCoherence * 0.6;
			const scoreB = b.totalScore * 0.4 + b.semanticCoherence * 0.6;
			return scoreB - scoreA;
		});

		// Remove duplicates
		const uniquePaths: SoraTraversalPath[] = [];
		const pathSignatures = new Set<string>();

		for (const path of paths) {
			const signature = path.nodes.map(n => n.id).join('-');
			if (!pathSignatures.has(signature)) {
				pathSignatures.add(signature);
				uniquePaths.push(path);
			}
		}

		return uniquePaths.slice(0, limit);
	}

	private cosineSimilarity(a: Float32Array, b: Float32Array): number {
		if (a.length !== b.length) return 0;

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}

		if (normA === 0 || normB === 0) return 0;
		return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
	}

	private mapLabelsToType(labels: string[]): SoraGraphNode['type'] {
		if (labels.includes('Document')) return 'document';
		if (labels.includes('Case')) return 'case';
		if (labels.includes('Evidence')) return 'evidence';
		if (labels.includes('Entity')) return 'entity';
		if (labels.includes('Concept')) return 'concept';
		return 'relationship';
	}

	private mapRelationshipType(relType: string): SoraGraphEdge['type'] {
		const mapping: Record<string, SoraGraphEdge['type']> = {
			CITES: 'cites',
			CONTAINS: 'contains',
			RELATED_TO: 'related',
			SIMILAR_TO: 'similar',
			REFERENCES: 'references',
			CONTRADICTS: 'contradicts'
		};
		return mapping[relType] ?? 'related';
	}

	private async breadthFirstTraversal(
		startNodeId: string,
		queryEmbedding: Float32Array,
		config: SoraTraversalOptions
	): Promise<SoraTraversalPath[]> {
		const startNode = await this.getNodeById(startNodeId);
		if (!startNode) return [];

		return [
			{
				nodes: [startNode],
				edges: [],
				totalScore: this.calculateNodeScore(startNode, queryEmbedding),
				pathLength: 1,
				semanticCoherence: 1.0
			}
		];
	}

	private async depthFirstTraversal(
		startNodeId: string,
		queryEmbedding: Float32Array,
		config: SoraTraversalOptions
	): Promise<SoraTraversalPath[]> {
		const startNode = await this.getNodeById(startNodeId);
		if (!startNode) return [];

		return [
			{
				nodes: [startNode],
				edges: [],
				totalScore: this.calculateNodeScore(startNode, queryEmbedding),
				pathLength: 1,
				semanticCoherence: 1.0
			}
		];
	}

	public clearCache(): void {
		this.traversalCache.clear();
	}

	/**
	 * Apply legal AI reranking to improve result relevance
	 */
	private async applyLegalReranking(
		paths: SoraTraversalPath[],
		query: string,
		config: SoraTraversalOptions
	): Promise<SoraTraversalPath[]> {
		try {
			const rerankInputs = paths.map((path, index) => ({
				id: `path_${index}`,
				score: path.totalScore,
				content: path.nodes.map(n => n.properties?.title ?? n.properties?.content ?? n.id).join(' → '),
				metadata: {
					pathLength: path.pathLength,
					semanticCoherence: path.semanticCoherence,
					nodeTypes: path.nodes.map(n => n.type),
					totalScore: path.totalScore
				}
			}));

			const userContext: UserContext = {
				intent: this.inferUserIntent(query),
				timeOfDay: this.getTimeOfDay(),
				userRole: 'user',
				workflowState: 'draft',
				recentActions: [],
				currentCase: undefined
			};

			const rerankedResults = (await this.reranker?.rerank(rerankInputs, userContext)) ?? [];

			const pathScoreMap = new Map<number, number>();
			rerankedResults.forEach((result: any, index: number) => {
				const originalIndex = parseInt(result.id.split('_')[1]);
				pathScoreMap.set(originalIndex, result.score ?? result.rerankScore ?? 0);
			});

			paths.forEach((path, index) => {
				const rerankScore = pathScoreMap.get(index) ?? path.totalScore;
				path.totalScore = path.totalScore * 0.6 + rerankScore * 0.4;
			});

			return paths.sort((a, b) => b.totalScore - a.totalScore);
		} catch (error) {
			console.warn('Legal reranking failed, using original order:', error);
			return paths;
		}
	}

	/**
	 * Store traversal data in dimensional tensor store
	 */
	private async storeTensorData(
		paths: SoraTraversalPath[],
		queryEmbedding: Float32Array,
		config: SoraTraversalOptions
	): Promise<void> {
		try {
			for (let i = 0; i < paths.length; i++) {
				const path = paths[i];
				const pathEmbedding = this.createPathEmbedding(path);

				if (pathEmbedding) {
					const tensorSlice: TensorSlice = {
						axis: 1,
						index: i,
						lodLevel: 0,
						data: pathEmbedding,
						dimensions: [pathEmbedding.length],
						metadata: {
							timestamp: Date.now(),
							hash: this.generatePathHash(path),
							size: pathEmbedding.byteLength,
							accessCount: 1,
							lastAccessed: Date.now()
						}
					};

					await this.tensorStore?.storeTensorSlice?.(tensorSlice);
				}
			}

			if (queryEmbedding) {
				const querySlice: TensorSlice = {
					axis: 3,
					index: 0,
					lodLevel: 0,
					data: queryEmbedding,
					dimensions: [queryEmbedding.length],
					metadata: {
						timestamp: Date.now(),
						hash: this.hashFloat32Array(queryEmbedding),
						size: queryEmbedding.byteLength,
						accessCount: 1,
						lastAccessed: Date.now()
					}
				};

				await this.tensorStore?.storeTensorSlice?.(querySlice);
			}
		} catch (error) {
			console.warn('Failed to store tensor data:', error);
		}
	}

	private createPathEmbedding(path: SoraTraversalPath): Float32Array | null {
		const nodeEmbeddings = path.nodes
			.map(node => node.embedding)
			.filter(embedding => embedding !== undefined) as Float32Array[];

		if (nodeEmbeddings.length === 0) return null;

		const embeddingDim = nodeEmbeddings[0].length;
		const pathEmbedding = new Float32Array(embeddingDim);

		for (let i = 0; i < embeddingDim; i++) {
			let sum = 0;
			for (const embedding of nodeEmbeddings) {
				sum += embedding[i];
			}
			pathEmbedding[i] = sum / nodeEmbeddings.length;
		}

		return pathEmbedding;
	}

	private generatePathHash(path: SoraTraversalPath): string {
		const pathSignature = path.nodes.map(n => `${n.id}:${n.type}`).join('|');
		return this.simpleHash(pathSignature);
	}

	private hashFloat32Array(array: Float32Array): string {
		const buffer = new Uint8Array(array.buffer);
		return this.simpleHash(Array.from(buffer).join(','));
	}

	private simpleHash(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}
		return hash.toString(16);
	}

	private inferUserIntent(query: string): UserContext['intent'] {
		const searchKeywords = ['find', 'search', 'look', 'show', 'list'];
		const analyzeKeywords = ['analyze', 'examine', 'investigate', 'study', 'review'];
		const createKeywords = ['create', 'new', 'add', 'make', 'generate'];
		const navigateKeywords = ['go', 'navigate', 'move', 'switch', 'open'];

		const lowerQuery = query.toLowerCase();

		if (searchKeywords.some(keyword => lowerQuery.includes(keyword))) return 'search';
		if (analyzeKeywords.some(keyword => lowerQuery.includes(keyword))) return 'analyze';
		if (createKeywords.some(keyword => lowerQuery.includes(keyword))) return 'create';
		if (navigateKeywords.some(keyword => lowerQuery.includes(keyword))) return 'navigate';

		return 'search';
	}

	private getTimeOfDay(): UserContext['timeOfDay'] {
		const hour = new Date().getHours();
		if (hour < 6) return 'night';
		if (hour < 12) return 'morning';
		if (hour < 18) return 'afternoon';
		if (hour < 22) return 'evening';
		return 'night';
	}

	public async computeBatchSimilarities(
		pathEmbeddings: Float32Array[],
		queryEmbedding: Float32Array
	): Promise<number[]> {
		try {
			return this.gpuIntegration?.computeBatchSimilarities
				? await this.gpuIntegration.computeBatchSimilarities(pathEmbeddings)
				: pathEmbeddings.map(embedding => this.cosineSimilarity(embedding, queryEmbedding));
		} catch (error) {
			console.warn('GPU batch similarity failed, using CPU fallback:', error);
			return pathEmbeddings.map(embedding => this.cosineSimilarity(embedding, queryEmbedding));
		}
	}

	public getReinforcementStats(): {
		totalNodes: number;
		avgVisitCount: number;
		topNodes: Array<{ id: string; visits: number }>;
	} {
		const entries = Array.from(this.reinforcementModel.entries());
		const totalVisits = entries.reduce((sum, [_, visits]) => sum + visits, 0);

		return {
			totalNodes: entries.length,
			avgVisitCount: totalVisits / Math.max(1, entries.length),
			topNodes: entries
				.sort((a, b) => b[1] - a[1])
				.slice(0, 10)
				.map(([id, visits]) => ({ id, visits }))
		};
	}

	public async getTensorStats(): Promise<any> {
		try {
			const stats = (await this.tensorStore?.getStats?.()) ?? {};
			return {
				totalSlices: stats?.totalTensorSlices ?? 0,
				totalSize: stats?.totalMemoryUsage ?? 0,
				cacheHitRate: stats?.cacheHitRate ?? 0,
				dimensions: stats?.dimensions ?? {
					documents: 0,
					chunks: 0,
					representations: 0
				}
			};
		} catch (error) {
			return {
				totalSlices: 0,
				totalSize: 0,
				cacheHitRate: 0,
				dimensions: {
					documents: 0,
					chunks: 0,
					representations: 0
				}
			};
		}
	}
}
