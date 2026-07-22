import { createQueryHash, type AceCacheIdentity } from '../cache/cache-key.js';
import { RevisionAwareCache } from '../cache/revision-aware-cache.js';
import {
  RedisExactLane,
  PostgresLexicalLane,
  QdrantDenseLane,
  Neo4jTopologyLane,
  PlaybookLane,
  OutcomeLedgerLane,
  McpToolLane,
  type EvidenceLaneConfig
} from './evidence-lanes.js';
import type { AceEvidence } from '../contracts/ace-context-packet.js';
import { LlamaTokenizerClient } from '../tokenizer/llama-tokenizer-client.js';

export interface HyperRagRetrieverConfig {
  workspaceRevision: string;
  specificationRevision: string;
  retrievalSnapshot: string;
  playbookRevision: string;
  embeddingContract: string;
  tokenizerContract: string;
  laneConfigs?: Partial<Record<string, EvidenceLaneConfig>>;
}

export class HyperRagRetriever {
  private cache: RevisionAwareCache;
  private tokenizer: LlamaTokenizerClient;
  private config: HyperRagRetrieverConfig;

  private redisExact: RedisExactLane;
  private postgresLexical: PostgresLexicalLane;
  private qdrantDense: QdrantDenseLane;
  private neo4jTopology: Neo4jTopologyLane;
  private playbook: PlaybookLane;
  private outcomeLedger: OutcomeLedgerLane;
  private mcpTools: McpToolLane;

  constructor(config: HyperRagRetrieverConfig) {
    this.config = config;
    this.cache = new RevisionAwareCache();
    this.tokenizer = new LlamaTokenizerClient({
      baseUrl: 'http://127.0.0.1:8090',
      model: 'gemma4-legal-iq4xs-direct.gguf'
    });

    this.redisExact = new RedisExactLane();
    this.postgresLexical = new PostgresLexicalLane();
    this.qdrantDense = new QdrantDenseLane();
    this.neo4jTopology = new Neo4jTopologyLane();
    this.playbook = new PlaybookLane();
    this.outcomeLedger = new OutcomeLedgerLane();
    this.mcpTools = new McpToolLane();
  }

  async retrieve(
    query: string,
    embedding: number[],
    generatorContract: string,
    signal?: AbortSignal
  ): Promise<AceEvidence[]> {
    const queryHash = createQueryHash(query);

    // Check revision-aware cache first
    const cacheIdentity: AceCacheIdentity = {
      queryHash,
      workspaceRevision: this.config.workspaceRevision,
      specificationRevision: this.config.specificationRevision,
      retrievalSnapshot: this.config.retrievalSnapshot,
      playbookRevision: this.config.playbookRevision,
      embeddingContract: this.config.embeddingContract,
      tokenizerContract: this.config.tokenizerContract,
      generatorContract
    };

    const cached = await this.cache.get(cacheIdentity);
    if (cached) {
      return cached as AceEvidence[];
    }

    // Fan out to all lanes in parallel
    const [
      redisExact,
      postgresLexical,
      qdrantDense,
      neo4jTopology,
      playbook,
      outcomeLedger,
      mcpTools
    ] = await Promise.allSettled([
      this.redisExact.search(queryHash, Object.keys(cacheIdentity).join(':')),
      this.postgresLexical.search(query, 20),
      this.qdrantDense.search(embedding, 20),
      this.neo4jTopology.search('', 2, 20),
      this.playbook.search(query, this.config.playbookRevision),
      this.outcomeLedger.search(queryHash, 5),
      this.mcpTools.search('legal', 8)
    ]);

    // Combine results, gracefully handling lane failures
    const combined: AceEvidence[] = [];

    if (redisExact.status === 'fulfilled') combined.push(...redisExact.value);
    if (postgresLexical.status === 'fulfilled') combined.push(...postgresLexical.value);
    if (qdrantDense.status === 'fulfilled') combined.push(...qdrantDense.value);
    if (neo4jTopology.status === 'fulfilled') combined.push(...neo4jTopology.value);
    if (playbook.status === 'fulfilled') combined.push(...playbook.value);
    if (outcomeLedger.status === 'fulfilled') combined.push(...outcomeLedger.value);
    if (mcpTools.status === 'fulfilled') combined.push(...mcpTools.value);

    const deduplicated = this.deduplicateEvidence(combined);
    const fused = await this.fuseScores(deduplicated);

    // Cache result
    await this.cache.set(cacheIdentity, fused, 3600);

    return fused;
  }

  private deduplicateEvidence(evidence: AceEvidence[]): AceEvidence[] {
    const seen = new Set<string>();
    const result: AceEvidence[] = [];

    for (const e of evidence) {
      const key = `${e.packetKey}:${e.sourceRef}:${e.contentHash}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(e);
      }
    }

    return result;
  }

  private async fuseScores(evidence: AceEvidence[]): Promise<AceEvidence[]> {
    // Placeholder: RRF or MMR fusion
    // For now, just return evidence with rawScore as fusedScore
    return evidence.map(e => ({
      ...e,
      fusedScore: e.rawScore
    }));
  }
}
