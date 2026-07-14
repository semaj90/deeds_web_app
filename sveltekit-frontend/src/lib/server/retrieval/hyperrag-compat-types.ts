import type { SummaryLensHit } from './summary-lenses.js';
import type { RoutingExplanation } from './routing-explanation.js';

export type HyperRagMode = 'codebase' | 'evidence' | 'legal' | 'docs' | 'programming_docs';

export type HyperRagHit = {
  id: string;
  sourcePath?: string;
  title?: string;
  text?: string;
  score: number;
  scoreWeightedSum?: number;
  signals: {
    dense?: number;
    graphAuthority?: number;
    clusterMatch?: number;
    pagerank?: number;
    aceBoost?: number;
    turbovec?: number;
    topoClass?: string;
    lexicalBoost?: number;
    taskBoost?: number;
    activity_w?: number;
    cluster_alias?: string;
    recencyOrHitRate?: number;
    engramBoost?: number;
  };
  rrfBreakdown?: Array<{
    lane: string;
    contribution: number;
  }>;
  manifold4?: [number, number, number, number];
  manifold4Meta?: {
    som_x: number;
    som_y: number;
    semantic_z: number;
    activity_w: number;
    cluster_id?: string;
    gpu_cluster?: string;
    som_cluster?: string;
    pagerank?: number;
    hit_rate?: number;
    last_used_at?: string;
    cluster_alias?: string | null;
  };
  reasons: string[];
  payload?: Record<string, unknown>;
  vector?: number[];
};

export type HyperRagResult = {
  query: string;
  variants: string[];
  hits: HyperRagHit[];
  graphPaths: unknown[];
  contextPack?: unknown;
  summaryLenses?: SummaryLensHit[];
  taskDistillate?: unknown;
  synthesis?: string | null;
  provenance: {
    qdrant: boolean;
    turbovec: boolean;
    redis: boolean;
    neo4j: boolean;
    ace: boolean;
    taskDistillates: boolean;
  };
  routingExplanation?: RoutingExplanation;
};
