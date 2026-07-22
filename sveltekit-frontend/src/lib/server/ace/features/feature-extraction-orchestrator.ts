import { db } from '$lib/server/db/client.js';
import { atlasPackets } from '$lib/server/db/schema/atlas-packets.js';
import { isNotNull } from 'drizzle-orm';
import { FeatureVectorGenerator } from './feature-vector-generator.js';
import { TreeNodeExtractor } from './tree-node-extractor.js';
import { DomainClassifier } from './domain-classifier.js';
import { SomClusterer } from './som-clustering.js';
import type { IdentityCore } from '../../../../schemas/atlas_canonical_schema.js';

/**
 * Feature Extraction → SOM Clustering Orchestrator
 * Gate 12 execution: 4-5 hours for 61,659 packets
 *
 * Pipeline:
 * 1. Read packets from Postgres (identity + content)
 * 2. Extract features: lexical, structural, semantic (40-dim vector)
 * 3. Extract tree nodes: deterministic SHA-256 node IDs
 * 4. Classify domain: 13-class rule-based classification
 * 5. Cluster: K-Means 20×20 SOM grid (400 clusters)
 * 6. Materialize: Write cluster assignments (4 columns, no conditionals)
 */

export interface OrchestrationOptions {
  dryRun?: boolean;
  limit?: number;
  verbose?: boolean;
  skipDomainClassification?: boolean;
}

export interface OrchestrationResult {
  totalPackets: number;
  processed: number;
  failed: number;
  featuresExtracted: number;
  clustered: number;
  materialized: number;
  duration: number;
  errors: Array<{ packetKey: string; error: string }>;
}

export class FeatureExtractionOrchestrator {
  private featureGen: FeatureVectorGenerator;
  private treeExtractor: TreeNodeExtractor;
  private domainClassifier: DomainClassifier;
  private somClusterer: SomClusterer;

  constructor() {
    this.featureGen = new FeatureVectorGenerator({
      maxVocabulary: 5000,
      embedding: {
        model: 'embeddinggemma',
        dimension: 384,
      },
    });
    this.treeExtractor = new TreeNodeExtractor();
    this.domainClassifier = new DomainClassifier();
    this.somClusterer = new SomClusterer({ k: 400, maxIterations: 50 });
  }

  /**
   * Main orchestration flow: extract features → cluster → materialize.
   */
  async orchestrate(options: OrchestrationOptions = {}): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const result: OrchestrationResult = {
      totalPackets: 0,
      processed: 0,
      failed: 0,
      featuresExtracted: 0,
      clustered: 0,
      materialized: 0,
      duration: 0,
      errors: [],
    };

    try {
      // Step 1: Load packets from Postgres
      let query = db
        .select({
          packetKey: atlasPackets.packetKey,
          sourceRef: atlasPackets.sourceRef,
          featureId: atlasPackets.featureId,
          nodeId: atlasPackets.treeNodeId,
          summary: atlasPackets.summary,
          payload: atlasPackets.payload,
        })
        .from(atlasPackets)
        .where(isNotNull(atlasPackets.sourceRef));

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const packets = await query;
      result.totalPackets = packets.length;

      if (options.verbose) {
        console.log(`[ORCHESTRATOR] Loaded ${packets.length} packets from Postgres`);
      }

      // Step 2: Extract features for all packets
      const packetFeatures: Array<{
        identity: IdentityCore;
        features: number[];
        domain?: string;
      }> = [];

      for (const pkt of packets) {
        try {
          const content = pkt.summary || (pkt.payload as any)?.text || '';

          // Extract features (40-dim: 20 lexical + 10 structural + 10 semantic)
          const featureVector = this.featureGen.generateFeatureVector(
            pkt.packetKey,
            pkt.sourceRef,
            content
          );

          // Extract tree nodes
          const nodes = this.treeExtractor.extract(pkt.sourceRef, content);
          const nodeId = nodes.length > 0 ? nodes[0].hash : (pkt.nodeId as string) || '';

          // Classify domain (optional)
          let domain: string | undefined;
          if (!options.skipDomainClassification) {
            domain = this.domainClassifier.classifyByPath(pkt.sourceRef);
          }

          packetFeatures.push({
            identity: {
              sourceRef: pkt.sourceRef,
              packetKey: pkt.packetKey,
              featureId: pkt.featureId,
              nodeId,
            },
            features: featureVector.features.slice(0, 40), // Use first 40 dims
            domain,
          });

          result.featuresExtracted++;
          result.processed++;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          result.failed++;
          result.errors.push({ packetKey: pkt.packetKey, error: errorMsg });

          if (options.verbose) {
            console.error(`[ORCHESTRATOR] Feature extraction failed for ${pkt.packetKey}:`, err);
          }
        }
      }

      if (options.verbose) {
        console.log(
          `[ORCHESTRATOR] Feature extraction complete: ${result.featuresExtracted}/${result.totalPackets}`
        );
      }

      // Step 3: Cluster features (K-Means 20×20 SOM grid)
      if (packetFeatures.length === 0) {
        console.warn('[ORCHESTRATOR] No features to cluster');
        result.duration = Date.now() - startTime;
        return result;
      }

      const clusterInput = packetFeatures.map((pf) => ({
        packetKey: pf.identity.packetKey,
        sourceRef: pf.identity.sourceRef,
        features: pf.features,
      }));

      const clusterResult = await this.somClusterer.cluster(clusterInput, { seed: 42 });
      result.clustered = clusterResult.totalSuccessful;

      if (options.verbose) {
        console.log(`[ORCHESTRATOR] K-Means clustering complete: ${result.clustered} assignments`);
        console.log(`  Iterations: ${clusterResult.iteration}, Convergence: ${clusterResult.convergence}`);
      }

      // Step 4: Materialize to Postgres (dry-run or apply)
      if (options.dryRun) {
        if (options.verbose) {
          console.log(`[ORCHESTRATOR] DRY RUN: Would materialize ${result.clustered} cluster assignments`);
          console.log(`  Sample assignments:`);
          clusterResult.assignments.slice(0, 3).forEach((a) => {
            console.log(
              `    ${a.packetKey}: cluster=${a.clusterId}, bmu=[${a.somBmuRow},${a.somBmuCol}], conf=${a.confidence.toFixed(3)}`
            );
          });
        }
      } else {
        const materializeResult = await this.somClusterer.materializeToPostgres(clusterResult);
        result.materialized = materializeResult.updated;
        result.failed += materializeResult.failed;

        if (options.verbose) {
          console.log(
            `[ORCHESTRATOR] Materialization complete: ${result.materialized} rows updated, ${materializeResult.failed} failed`
          );
        }
      }

      result.duration = Date.now() - startTime;
      return result;
    } catch (err) {
      result.duration = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      result.errors.push({ packetKey: 'ORCHESTRATOR', error: errorMsg });
      throw err;
    }
  }
}

/**
 * CLI entrypoint for Gate 12 execution.
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const orchestrator = new FeatureExtractionOrchestrator();

  const options: OrchestrationOptions = {
    dryRun: process.argv.includes('--dry-run'),
    limit: parseInt(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || '0'),
    verbose: process.argv.includes('--verbose'),
    skipDomainClassification: process.argv.includes('--skip-domain'),
  };

  orchestrator
    .orchestrate(options)
    .then((result) => {
      console.log('\n[RESULT]');
      console.log(`Total packets: ${result.totalPackets}`);
      console.log(`Processed: ${result.processed}`);
      console.log(`Features extracted: ${result.featuresExtracted}`);
      console.log(`Clustered: ${result.clustered}`);
      console.log(`Materialized: ${result.materialized}`);
      console.log(`Failed: ${result.failed}`);
      console.log(`Duration: ${(result.duration / 1000).toFixed(2)}s`);

      if (result.errors.length > 0) {
        console.log(`\n[ERRORS] (${result.errors.length})`);
        result.errors.slice(0, 10).forEach((e) => {
          console.log(`  ${e.packetKey}: ${e.error}`);
        });
      }

      process.exit(result.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('[FATAL]', err);
      process.exit(1);
    });
}
