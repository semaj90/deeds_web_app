/**
 * Library Sync Service - Step 6 Implementation
 * Periodically fetches latest libraries/tools from GitHub/context7 and stores agent/LLM call logs
 */

import { Redis } from 'ioredis';
import { redisVectorService } from './redis-vector-service.js';

export interface LibraryMetadata {
  id: string;
  name: string;
  version: string;
  source: 'github' | 'context7' | 'npm';
  url: string;
  description: string;
  lastUpdated: Date;
  tags: string[];
}

export interface AgentCallLog {
  id: string;
  timestamp: Date;
  agentType: 'rag' | 'best-practices' | 'crawler' | 'orchestrator' | 'evaluation';
  operation: string;
  input: any;
  output: any;
  duration: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

class LibrarySyncService {
  private redis: Redis;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 0,
    });
  }

  /**
   * Start periodic library sync (every 6 hours by default)
   */
  startPeriodicSync(intervalHours: number = 6): void {
    const intervalMs = intervalHours * 60 * 60 * 1000;

    this.syncInterval = setInterval(async () => {
      try {
        await this.syncAllLibraries();
        console.log('📚 Library sync completed successfully');
      } catch (error) {
        console.error('❌ Library sync failed:', error);
      }
    }, intervalMs);

    // Run initial sync
    this.syncAllLibraries().catch(console.error);
  }

  /**
   * Stop periodic sync
   */
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Sync all libraries from different sources
   */
  async syncAllLibraries(): Promise<void> {
    const promises = [
      this.syncGitHubLibraries(),
      this.syncContext7Libraries(),
      this.syncNpmLibraries(),
    ];

    await Promise.allSettled(promises);
  }

  /**
   * Fetch and sync libraries from GitHub
   */
  async syncGitHubLibraries(): Promise<void> {
    try {
      // Popular AI/ML libraries and frameworks
      const popularRepos = [
        'openai/openai-node',
        'anthropics/anthropic-sdk-typescript',
        'hwchase17/langchainjs',
        'microsoft/vscode',
        'sveltejs/kit',
        'microsoft/TypeScript',
        'vercel/ai',
        'redis/redis',
        'qdrant/qdrant-js',
        'jonahcrenshaw/crewai',
        'microsoft/autogen',
      ];

      for (const repo of popularRepos) {
        const metadata = await this.fetchGitHubRepoMetadata(repo);
        if (metadata) {
          await this.storeLibraryMetadata(metadata);
        }
      }
    } catch (error) {
      console.error('Failed to sync GitHub libraries:', error);
    }
  }

  /**
   * Fetch repository metadata from GitHub API
   */
  async fetchGitHubRepoMetadata(repo: string): Promise<LibraryMetadata | null> {
    try {
      const response = await fetch(`https://api.github.com/repos/${repo}`, {
        headers: {
          'User-Agent': 'Enhanced-RAG-Assistant',
          ...(process.env.GITHUB_TOKEN && {
            Authorization: `token ${process.env.GITHUB_TOKEN}`,
          }),
        },
      });

      if (!response.ok) return null;

      const data = await response.json();

      return {
        id: `github-${repo.replace('/', '-')}`,
        name: data.name,
        version: data.default_branch || 'main',
        source: 'github',
        url: data.html_url,
        description: data.description || '',
        lastUpdated: new Date(data.updated_at),
        tags: data.topics || [],
      };
    } catch (error) {
      console.error(`Failed to fetch GitHub repo ${repo}:`, error);
      return null;
    }
  }

  /**
   * Sync libraries from Context7
   */
  async syncContext7Libraries(): Promise<void> {
    try {
      // This would integrate with Context7 API when available
      // For now, we'll store known context7 libraries
      const context7Libraries = [
        {
          id: 'context7-mongodb',
          name: 'MongoDB Context7',
          version: 'latest',
          source: 'context7' as const,
          url: '/mongodb/docs',
          description: 'MongoDB documentation and context',
          lastUpdated: new Date(),
          tags: ['database', 'nosql', 'mongodb'],
        },
        {
          id: 'context7-nextjs',
          name: 'Next.js Context7',
          version: 'latest',
          source: 'context7' as const,
          url: '/vercel/next.js',
          description: 'Next.js framework documentation',
          lastUpdated: new Date(),
          tags: ['react', 'framework', 'nextjs'],
        },
      ];

      for (const lib of context7Libraries) {
        await this.storeLibraryMetadata(lib);
      }
    } catch (error) {
      console.error('Failed to sync Context7 libraries:', error);
    }
  }

  /**
   * Sync popular NPM packages
   */
  async syncNpmLibraries(): Promise<void> {
    try {
      const popularPackages = [
        '@langchain/core',
        'openai',
        '@anthropic-ai/sdk',
        'redis',
        'qdrant-js',
        'pdf-parse',
        'puppeteer',
        'cheerio',
        'svelte',
        '@sveltejs/kit',
      ];

      for (const pkg of popularPackages) {
        const metadata = await this.fetchNpmPackageMetadata(pkg);
        if (metadata) {
          await this.storeLibraryMetadata(metadata);
        }
      }
    } catch (error) {
      console.error('Failed to sync NPM libraries:', error);
    }
  }

  /**
   * Fetch NPM package metadata
   */
  async fetchNpmPackageMetadata(packageName: string): Promise<LibraryMetadata | null> {
    try {
      const response = await fetch(`https://registry.npmjs.org/${packageName}`);
      if (!response.ok) return null;

      const data = await response.json();
      const latestVersion = data['dist-tags']?.latest || '';

      return {
        id: `npm-${packageName.replace(/[@\/]/g, '-')}`,
        name: packageName,
        version: latestVersion,
        source: 'npm',
        url: `https://www.npmjs.com/package/${packageName}`,
        description: data.description || '',
        lastUpdated: new Date(data.time?.[latestVersion] || Date.now()),
        tags: data.keywords || [],
      };
    } catch (error) {
      console.error(`Failed to fetch NPM package ${packageName}:`, error);
      return null;
    }
  }

  /**
   * Store library metadata in Redis
   */
  async storeLibraryMetadata(metadata: LibraryMetadata): Promise<void> {
    const key = `library:${metadata.id}`;
    await this.redis.setex(key, 86400, JSON.stringify(metadata)); // 24 hour TTL

    // Add to library index
    await this.redis.sadd('libraries:index', metadata.id);

    // Index by source
    await this.redis.sadd(`libraries:source:${metadata.source}`, metadata.id);

    // Index by tags
    for (const tag of metadata.tags) {
      await this.redis.sadd(`libraries:tag:${tag}`, metadata.id);
    }
  }

  /**
   * Log agent/LLM calls for audit and RAG
   */
  async logAgentCall(log: AgentCallLog): Promise<void> {
    try {
      // Store in Redis with timestamp-based key
      const key = `agent_log:${log.agentType}:${log.timestamp.getTime()}:${log.id}`;
      await this.redis.setex(key, 86400 * 7, JSON.stringify(log)); // 7 day TTL

      // Add to agent logs index
      await this.redis.zadd('agent_logs:timeline', log.timestamp.getTime(), key);

      // Index by agent type
      await this.redis.zadd(`agent_logs:${log.agentType}`, log.timestamp.getTime(), key);

      // Store in vector DB for semantic search if text content available
      if (log.input || log.output) {
        const content = `Operation: ${log.operation}\nInput: ${JSON.stringify(log.input)}\nOutput: ${JSON.stringify(log.output)}`;

        await redisVectorService.addDocument({
          id: `agent_log_${log.id}`,
          content,
          metadata: {
            type: 'agent_log',
            agentType: log.agentType,
            operation: log.operation,
            timestamp: log.timestamp.toISOString(),
            success: log.success,
            duration: log.duration,
          },
        });
      }

      console.log(`📝 Logged agent call: ${log.agentType}/${log.operation}`);
    } catch (error) {
      console.error('Failed to log agent call:', error);
    }
  }

  /**
   * Get recent agent logs
   */
  async getRecentAgentLogs(agentType?: string, limit: number = 50): Promise<AgentCallLog[]> {
    try {
      const indexKey = agentType ? `agent_logs:${agentType}` : 'agent_logs:timeline';
      const logKeys = await this.redis.zrevrange(indexKey, 0, limit - 1);

      const logs: AgentCallLog[] = [];
      for (const key of logKeys) {
        const logData = await this.redis.get(key);
        if (logData) {
          logs.push(<any>(<any>JSON.parse(logData)));
        }
      }

      return logs;
    } catch (error) {
      console.error('Failed to get agent logs:', error);
      return [];
    }
  }

  /**
   * Search libraries by query
   */
  async searchLibraries(
    query: string,
    source?: 'github' | 'context7' | 'npm'
  ): Promise<LibraryMetadata[]> {
    try {
      const indexKey = source ? `libraries:source:${source}` : 'libraries:index';
      const libraryIds = await this.redis.smembers(indexKey);

      const libraries: LibraryMetadata[] = [];
      for (const id of libraryIds) {
        const data = await this.redis.get(`library:${id}`);
        if (data) {
          const lib = JSON.parse(data) as LibraryMetadata;
          // Simple text matching - could be enhanced with fuzzy search
          if (
            lib.name.toLowerCase().includes(query.toLowerCase()) ||
            lib.description.toLowerCase().includes(query.toLowerCase()) ||
            lib.tags.some((tag) => tag.toLowerCase().includes(query.toLowerCase()))
          ) {
            libraries.push(<any>(<any>lib));
          }
        }
      }

      return libraries.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
    } catch (error) {
      console.error('Failed to search libraries:', error);
      return [];
    }
  }

  /**
   * Get library by ID
   */
  async getLibrary(id: string): Promise<LibraryMetadata | null> {
    try {
      const data = await this.redis.get(`library:${id}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to get library:', error);
      return null;
    }
  }

  /**
   * Cleanup old logs and libraries
   */
  async cleanup(): Promise<void> {
    try {
      // Clean up old agent logs (older than 30 days)
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

      const oldLogs = await this.redis.zrangebyscore('agent_logs:timeline', 0, thirtyDaysAgo);
      for (const logKey of oldLogs) {
        await this.redis.del(logKey);
      }

      await this.redis.zremrangebyscore('agent_logs:timeline', 0, thirtyDaysAgo);

      console.log(`🧹 Cleaned up ${oldLogs.length} old agent logs`);
    } catch (error) {
      console.error('Failed to cleanup:', error);
    }
  }
}

export const librarySyncService = new LibrarySyncService();
