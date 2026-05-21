import { getClusterAlias } from '$lib/server/retrieval/query-profile-router.js';

/**
 * src/lib/server/retrieval/routing-explanation.ts
 * 
 * Formats topological and task routing metadata for the Admin Copilot.
 */

export type RoutingExplanation = {
  profile: string;
  lexicalClusters: string[];
  topologyClusters: string[];
  profileClusters: string[];
  taskClusters: string[];
  finalClusters: string[];
  clusterAliases: string[];
  profileClusterAliases: string[];
  fallbacks: string[];
  redisCards: string[];
  taskDistillate?: string;
  subgraphSeedEnvelope?: {
    version: string;
    contract: {
      query: string | null;
      filePath: string | null;
      route: string | null;
      symbol: string | null;
    };
    caps: {
      maxSeeds: number;
      maxNeighbors: number;
      maxHops: 1 | 2;
    };
    labels: {
      centroid_label: string | null;
      topology_label: string | null;
      cluster_key: string | null;
      hotness_bucket: string;
      feature_family: string;
      tags: Record<string, string | number | boolean | null | string[]>;
    };
    primaryFileTargets: string[];
    seeds: Array<{
      kind: string;
      key: string;
      score: number;
      label: string;
      reasons: string[];
      stableKey?: string;
      filePath?: string;
      route?: string;
      symbol?: string;
      clusterId?: number;
    }>;
    neighborhood: Array<{
      kind: string;
      key: string;
      score: number;
      label: string;
      reasons: string[];
      stableKey?: string;
      filePath?: string;
      route?: string;
      symbol?: string;
      clusterId?: number;
      pagerank?: number | null;
    }>;
  };
  engram?: {
    enabled: boolean;
    didYouMean?: string;
    bmuHints: string[];
    clusterHints: string[];
    trust: string;
  };
};

export class RoutingExplanationBuilder {
  private explanation: RoutingExplanation = {
    profile: 'general',
    lexicalClusters: [],
    topologyClusters: [],
    profileClusters: [],
    taskClusters: [],
    finalClusters: [],
    clusterAliases: [],
    profileClusterAliases: [],
    fallbacks: [],
    redisCards: [],
  };

  public setProfile(profile: string) {
    this.explanation.profile = profile;
    return this;
  }

  public setLexicalClusters(ids: number[]) {
    this.explanation.lexicalClusters = ids.map(String);
    return this;
  }

  public setTopologyClusters(ids: number[]) {
    this.explanation.topologyClusters = ids.map(String);
    return this;
  }

  public setProfileClusters(ids: number[]) {
    this.explanation.profileClusters = ids.map(String);
    return this;
  }

  public setTaskClusters(ids: number[]) {
    this.explanation.taskClusters = ids.map(String);
    return this;
  }

  public setFinalClusters(ids: number[]) {
    this.explanation.finalClusters = [...new Set(ids)].map(String);
    this.explanation.clusterAliases = [...new Set(ids.map((id) => getClusterAlias(id)).filter((alias): alias is string => Boolean(alias)))];
    return this;
  }

  public setProfileClusterAliases(ids: number[]) {
    this.explanation.profileClusterAliases = [...new Set(ids.map((id) => getClusterAlias(id)).filter((alias): alias is string => Boolean(alias)))];
    return this;
  }

  public addTaskDistillate(key: string) {
    this.explanation.taskDistillate = key;
    return this;
  }

  public addRedisCard(id: number) {
    this.explanation.redisCards.push(`ace:cluster:${id}`);
    return this;
  }

  public setSubgraphSeedEnvelope(
    envelope: RoutingExplanation['subgraphSeedEnvelope']
  ) {
    this.explanation.subgraphSeedEnvelope = envelope;
    return this;
  }

  public addFallback(message: string) {
    this.explanation.fallbacks.push(message);
    return this;
  }

  public setEngram(engram: RoutingExplanation['engram']) {
    this.explanation.engram = engram;
    return this;
  }

  public build(): RoutingExplanation {
    return this.explanation;
  }
}
