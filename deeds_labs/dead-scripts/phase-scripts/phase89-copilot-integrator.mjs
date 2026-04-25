#!/usr/bin/env node
/**
 * Phase 89: Copilot.md Knowledge Integrator
 * - Reads cluster summaries from Redis/Qdrant
 * - Generates markdown sections for copilot.md
 * - Auto-tagged with ripgrep metadata
 * - Syncs to FastMCP knowledge base
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import fs from 'fs/promises';
import Redis from 'ioredis';
import path from 'path';

const COPILOT_PATH = path.resolve(process.cwd(), 'copilot.md');

class CopilotKnowledgeIntegrator {
  constructor() {
    this.redis = new Redis({ host: 'localhost', port: 6379, db: 0 });
    this.qdrant = new QdrantClient({ url: 'http://localhost:6333' });
  }

  /**
   * Fetch all clusters from Redis + Qdrant
   */
  async fetchClusters() {
    const keys = await this.redis.keys('phase89:cluster:*');
    console.log(`📦 Found ${keys.length} clusters in Redis`);

    const clusters = [];
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const cluster = JSON.parse(data);
        const clusterId = key.split(':')[2];
        clusters.push({ id: parseInt(clusterId), ...cluster });
      }
    }

    // Fetch vector search metadata from Qdrant
    try {
      const qdrantClusters = await this.qdrant.scroll('phase89_error_clusters', {
        limit: 100,
        with_payload: true,
        with_vector: false
      });

      // Merge Qdrant metadata with Redis clusters
      for (const cluster of clusters) {
        const qdrantMatch = qdrantClusters.points.find(
          (p) => p.payload?.cluster_id === cluster.id
        );
        if (qdrantMatch) {
          cluster.vector_metadata = {
            searchable: true,
            indexed_at: qdrantMatch.payload?.indexed_at,
            embedding_model: 'embeddinggemma:latest',
            similarity_metric: 'cosine'
          };
        }
      }
    } catch (err) {
      console.warn('⚠️  Could not fetch Qdrant metadata:', err.message);
    }

    return clusters.sort((a, b) => b.size - a.size); // Sort by size desc
  }

  /**
   * Generate markdown section for copilot.md
   */
  generateMarkdown(clusters) {
    const sections = [];

    sections.push('# Phase 89: Error Cluster Knowledge Base\n');
    sections.push('> Auto-generated from GPU clustering + LLM summarization\n');
    sections.push(`> Last updated: ${new Date().toISOString()}\n\n`);

    sections.push('## Cluster Overview\n');
    sections.push(`- **Total Clusters**: ${clusters.length}`);
    sections.push(`- **Total Errors**: ${clusters.reduce((sum, c) => sum + c.size, 0)}`);
    sections.push(`- **Largest Cluster**: ${clusters[0]?.size || 0} errors\n\n`);

    sections.push('## Clusters (Sorted by Size)\n\n');

    for (const cluster of clusters.slice(0, 20)) {
      // Top 20
      sections.push(`### Cluster ${cluster.id} (${cluster.size} errors)\n`);
      sections.push(`**Tags**: ${cluster.tags.map((t) => `\`${t}\``).join(', ')}\n\n`);
      sections.push(`**Summary**: ${cluster.summary}\n\n`);
      sections.push(`**Error IDs**: ${cluster.error_ids.slice(0, 10).join(', ')}${cluster.error_ids.length > 10 ? '...' : ''}\n\n`);

      // Add vector search metadata if available
      if (cluster.vector_metadata?.searchable) {
        sections.push(`**Vector Search**: ✅ Indexed in Qdrant\n`);
        sections.push(`- Model: \`${cluster.vector_metadata.embedding_model}\`\n`);
        sections.push(`- Similarity: \`${cluster.vector_metadata.similarity_metric}\`\n\n`);
      }

      sections.push('---\n\n');
    }

    sections.push('## Tag Index (Ripgrep Searchable)\n\n');

    const tagIndex = new Map();
    for (const cluster of clusters) {
      for (const tag of cluster.tags) {
        if (!tagIndex.has(tag)) {
          tagIndex.set(tag, []);
        }
        tagIndex.get(tag).push(cluster.id);
      }
    }

    for (const [tag, clusterIds] of [...tagIndex.entries()].sort()) {
      sections.push(`- **${tag}**: Clusters ${clusterIds.join(', ')}\n`);
    }

    return sections.join('');
  }

  /**
   * Update copilot.md with new knowledge
   */
  async updateCopilotMd(markdown) {
    let existingContent = '';
    try {
      existingContent = await fs.readFile(COPILOT_PATH, 'utf-8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    // Append or replace Phase 89 section
    const phase89Marker = '# Phase 89: Error Cluster Knowledge Base';
    const markerIndex = existingContent.indexOf(phase89Marker);

    let newContent;
    if (markerIndex !== -1) {
      // Replace existing section
      const nextSectionIndex = existingContent.indexOf('\n# ', markerIndex + 1);
      const beforeSection = existingContent.slice(0, markerIndex);
      const afterSection = nextSectionIndex !== -1 ? existingContent.slice(nextSectionIndex) : '';
      newContent = beforeSection + markdown + '\n' + afterSection;
    } else {
      // Append new section
      newContent = existingContent + '\n\n' + markdown;
    }

    await fs.writeFile(COPILOT_PATH, newContent, 'utf-8');
    console.log(`✅ Updated ${COPILOT_PATH}`);
  }

  /**
   * Sync to FastMCP knowledge base (via API)
   */
  async syncToFastMCP(clusters) {
    // FastMCP typically exposes a /knowledge endpoint
    const fastmcpUrl = process.env.FASTMCP_URL || 'http://localhost:3003/knowledge';

    for (const cluster of clusters.slice(0, 50)) {
      // Limit to top 50
      const payload = {
        id: `phase89-cluster-${cluster.id}`,
        title: `Cluster ${cluster.id}: ${cluster.tags.slice(0, 2).join(', ')}`,
        content: cluster.summary,
        tags: cluster.tags,
        metadata: {
          error_count: cluster.size,
          error_ids: cluster.error_ids.slice(0, 10),
          source: 'phase89-gpu-clustering',
        },
      };

      try {
        const response = await fetch(fastmcpUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          console.log(`   ✅ Synced cluster ${cluster.id} to FastMCP`);
        } else {
          console.warn(`   ⚠️  Failed to sync cluster ${cluster.id}: ${response.statusText}`);
        }
      } catch (err) {
        console.warn(`   ⚠️  FastMCP sync error: ${err.message}`);
        break; // Stop if FastMCP is unreachable
      }
    }
  }

  /**
   * Main integration pipeline
   */
  async run() {
    console.log('🧠 Phase 89: Copilot.md Knowledge Integrator\n');

    const clusters = await this.fetchClusters();

    if (clusters.length === 0) {
      console.log('⚠️  No clusters found. Run phase89-gpu-streaming-cluster.py first.');
      return;
    }

    const markdown = this.generateMarkdown(clusters);
    await this.updateCopilotMd(markdown);

    // Optional: Sync to FastMCP
    if (process.argv.includes('--fastmcp')) {
      console.log('\n🔌 Syncing to FastMCP...');
      await this.syncToFastMCP(clusters);
    }

    console.log('\n✅ Integration Complete!');
    console.log(`   - Clusters processed: ${clusters.length}`);
    console.log(`   - copilot.md updated`);
    console.log(`   - Use 'rg "svelte5-runes"' to search tags\n`);
  }

  async cleanup() {
    await this.redis.quit();
  }
}

// Main
const integrator = new CopilotKnowledgeIntegrator();
integrator
  .run()
  .catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  })
  .finally(() => integrator.cleanup());
