import { bifrostChat } from '$lib/server/ollama.js';
import { ENV } from '$lib/server/env.server.js';

export interface RaptorNode {
  id: string;
  level: number;
  summary: string;
  children: string[]; // IDs of children nodes
  metadata: any;
}

/**
 * RaptorSummarizer
 * 
 * Implements hierarchical summarization (RAPTOR-lite) for the KAG pipeline.
 * Recursively clusters and summarizes knowledge nodes to enable thematic retrieval.
 */
export class RaptorSummarizer {
  /**
   * Summarize a set of text chunks into a single higher-level concept.
   */
  static async summarizeCluster(chunks: string[], level: number = 0): Promise<string> {
    if (chunks.length === 0) return '';
    if (chunks.length === 1) return chunks[0];

    const context = chunks.join('\n\n---\n\n');
    const prompt = `
[HIERARCHICAL SUMMARIZATION - LEVEL ${level}]
Synthesize the following information into a single, high-density abstract summary.
Focus on extracting the "thematic core" and overarching patterns.

CONTENT:
${context}

ABSTRACT SUMMARY:
`.trim();

    try {
      const summary = await bifrostChat(
        [{ role: 'user', content: prompt }],
        ENV.GEMMA4_MODEL,
        { temperature: 0.1, maxTokens: 500, cacheKey: `raptor:${level}:${chunks.length}` }
      );
      return summary;
    } catch (err) {
      console.error(`[RaptorSummarizer] Level ${level} failed:`, err);
      return chunks[0].slice(0, 500); // Fallback to first chunk
    }
  }

  /**
   * Recursive Hierarchical Build
   * 
   * Takes a set of text fragments (leaf nodes) and builds a summary tree.
   * Uses a branching factor of 5 (groups 5 children per parent).
   */
  static async buildTree(leafNodes: string[], currentLevel: number = 0): Promise<RaptorNode[]> {
    if (leafNodes.length === 0) return [];
    
    const treeNodes: RaptorNode[] = [];
    const parentTexts: string[] = [];
    const branchingFactor = 5;

    // 1. Create leaf nodes for the bottom level (if level 0)
    if (currentLevel === 0) {
      for (let i = 0; i < leafNodes.length; i++) {
        treeNodes.push({
          id: `node:0:${i}`,
          level: 0,
          summary: leafNodes[i],
          children: [],
          metadata: { index: i }
        });
      }
    }

    // 2. Group current level nodes into clusters and summarize
    for (let i = 0; i < leafNodes.length; i += branchingFactor) {
      const cluster = leafNodes.slice(i, i + branchingFactor);
      if (cluster.length > 0) {
        const parentSummary = await this.summarizeCluster(cluster, currentLevel + 1);
        parentTexts.push(parentSummary);
        
        treeNodes.push({
          id: `node:${currentLevel + 1}:${parentTexts.length - 1}`,
          level: currentLevel + 1,
          summary: parentSummary,
          children: cluster.map((_, idx) => `node:${currentLevel}:${i + idx}`),
          metadata: { clusterSize: cluster.length }
        });
      }
    }

    // 3. If we have more than 1 parent, recurse to build the next level
    if (parentTexts.length > 1) {
      const higherNodes = await this.buildTree(parentTexts, currentLevel + 1);
      return [...treeNodes, ...higherNodes];
    }

    return treeNodes;
  }

  /** Persist tree to database — saves generated RaptorNodes to qdrant_centroid_clusters. */
  static async persistTree(nodes: RaptorNode[], collectionName: string = 'global-legal'): Promise<void> {
    const { db } = await import('$lib/server/db/client');
    const { qdrantCentroidClusters } = await import('$lib/server/db/schema/kag-dag');
    
    console.log(`[RaptorSummarizer] Persisting ${nodes.length} nodes to database...`);

    for (const node of nodes) {
      if (node.level === 0) continue; // Skip leaf nodes as they are already in the base index

      try {
        await db.insert(qdrantCentroidClusters).values({
          clusterKey: node.id,
          collectionName,
          label: `Level ${node.level} Synthesis`,
          summary: node.summary,
          memberCount: node.children.length,
          metadata: {
            ...node.metadata,
            level: node.level,
            children: node.children
          }
        }).onConflictDoUpdate({
          target: qdrantCentroidClusters.clusterKey,
          set: {
            summary: node.summary,
            updatedAt: new Date()
          }
        });
      } catch (err) {
        console.error(`[RaptorSummarizer] Failed to persist node ${node.id}:`, err);
      }
    }
  }
}


