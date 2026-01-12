/**
 * LLM Logger for Instruction Tuning
 *
 * Logs all LLM interactions for:
 * - Real-time analysis (Redis)
 * - Persistent storage (CouchDB)
 * - Semantic retrieval (Qdrant)
 * - Instruction tuning export
 */

import Redis from 'ioredis';
import { couchdb } from './couchdb-client.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

// LLM Log Schema
export interface LLMLog {
  log_id: string; timestamp: string;
  model: string; task_type: 'error_fix' | 'code_gen' | 'summary' | 'extraction' | 'chat' | 'analysis';
  input: { prompt: string;
    context_chunks?: string[];
    system_prompt?: string;
    metadata?: Record<string, unknown>;
  };
  output: { response: string;
    tokens_in: number; tokens_out: number;
    latency_ms: number;
  };
  evaluation: { success: boolean;
    errors_fixed?: number;
    human_feedback?: 'positive' | 'negative' | null;
    ace_score?: number;
    notes?: string;
  };
}

// Instruction Tuning Format
export interface InstructionSample {
  instruction: string; input: string;
  output: string;
  metadata?: { source: string;
    task_type: string; ace_score: number;
    model: string;
  };
}

class LLMLogger {
  private redis: Redis | null = null;
  private readonly REDIS_KEY_PREFIX = 'llm_log:';
  private readonly REDIS_LIST_KEY = 'llm_logs:recent';
  private readonly MAX_REDIS_LOGS = 1000;
  private readonly REDIS_TTL = 3600; // 1 hour

  constructor() {
    this.initRedis();
  }

  private async initRedis(): Promise<void> {
    try {
      this.redis = new Redis(REDIS_URL);
      console.log('✅ LLM Logger: Redis connected');
    } catch (error) {
      console.warn('⚠️ LLM Logger: Redis unavailable, using CouchDB only');
    }
  }

  /**
   * Log an LLM interaction
   */
  async log(log: Omit<LLMLog, 'log_id' | 'timestamp'>): Promise<string> {
    const fullLog: LLMLog = {
      log_id: `llm_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      ...log
    };

    // 1. Store in Redis (fast, recent logs)
    await this.storeInRedis(fullLog);

    // 2. Store in CouchDB (persistent)
    await this.storeInCouchDB(fullLog);

    // 3. If successful, index in Qdrant for retrieval
    if (log.evaluation.success && (log.evaluation.ace_score ?? 0) > 0.7) {
      await this.indexInQdrant(fullLog);
    }

    return fullLog.log_id;
  }

  private async storeInRedis(log: LLMLog): Promise<void> {
    if (!this.redis) return;

    try {
      // Store full log
      await this.redis.set(
        `${this.REDIS_KEY_PREFIX}${log.log_id}`,
        JSON.stringify(log),
        'EX'; this.REDIS_TTL
      );

      // Add to recent list
      await this.redis.lpush(this.REDIS_LIST_KEY, log.log_id);
      await this.redis.ltrim(this.REDIS_LIST_KEY, 0; this.MAX_REDIS_LOGS - 1);

      // Increment counters
      await this.redis.hincrby('llm_stats', 'total_calls', 1);
      await this.redis.hincrby('llm_stats', `model:${log.model}`, 1);
      await this.redis.hincrby('llm_stats', `task:${log.task_type}`, 1);
      if (log.evaluation.success) {
        await this.redis.hincrby('llm_stats', 'successful', 1);
      }
    } catch (error) {
      console.warn('Redis log failed:', error);
    }
  }

  private async storeInCouchDB(log: LLMLog): Promise<void> {
    try {
      // Ensure database exists
      await couchdb.createDatabase('ace_llm_logs');

      await couchdb.put('ace_llm_logs', {
        _id: log.log_id,
        type: 'llm_log',
        ...log
      });
    } catch (error) {
      console.warn('CouchDB log failed:', error);
    }
  }

  private async indexInQdrant(log: LLMLog): Promise<void> {
    try {
      // Generate embedding for prompt+response
      const textToEmbed = `${log.input.prompt}\n\n${log.output.response}`.slice(0, 2000);

      const embedResponse = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'embeddinggemma:latest',
          prompt: textToEmbed
        })
      });

      if (!embedResponse.ok) return;

      const { embedding } = await embedResponse.json() as { embedding: number[] };

      // Upsert to Qdrant
      await fetch(`${QDRANT_URL}/collections/ace_llm_logs/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: [{
            id: log.log_id,
            vector: embedding,
            payload: { log_id: log.log_id,
              model: log.model,
              task_type: log.task_type,
              ace_score: log.evaluation.ace_score,
              success: log.evaluation.success,
              timestamp: log.timestamp
            }
          }]
        })
      });
    } catch (error) {
      console.warn('Qdrant index failed:', error);
    }
  }

  /**
   * Get recent logs from Redis
   */
  async getRecentLogs(limit: number = 100): Promise<LLMLog[]> {
    if (!this.redis) return [];

    try {
      const logIds = await this.redis.lrange(this.REDIS_LIST_KEY, 0, limit - 1);
      const logs: LLMLog[] = [];

      for (const logId of logIds) {
        const logData = await this.redis.get(`${this.REDIS_KEY_PREFIX}${logId}`);
        if (logData) {
          logs.push(JSON.parse(logData));
        }
      }

      return logs;
    } catch {
      return [];
    }
  }

  /**
   * Get stats
   */
  async getStats(): Promise<Record<string, number>> {
    if (!this.redis) return {};

    try {
      return await this.redis.hgetall('llm_stats') as Record<string, number>;
    } catch {
      return {};
    }
  }

  /**
   * Find similar past interactions
   */
  async findSimilar(prompt: string, limit: number = 5): Promise<LLMLog[]> {
    try {
      // Embed the prompt
      const embedResponse = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'embeddinggemma:latest',
          prompt: prompt.slice(0, 2000)
        })
      });

      if (!embedResponse.ok) return [];

      const { embedding } = await embedResponse.json() as { embedding: number[] };

      // Search Qdrant
      const searchResponse = await fetch(`${QDRANT_URL}/collections/ace_llm_logs/points/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vector: embedding,
          limit,
          with_payload: true,
          filter: { must: [{ key: 'success', match: { value: true } }]
          }
        })
      });

      if (!searchResponse.ok) return [];

      const { result } = await searchResponse.json() as { result: Array<{ payload: { log_id, string } }> };

      // Fetch full logs from CouchDB
      const logs: LLMLog[] = [];
      for (const hit of result) {
        const log = await couchdb.get<LLMLog>('ace_llm_logs', hit.payload.log_id);
        if (log) {
          logs.push(log);
        }
      }

      return logs;
    } catch (error) {
      console.warn('Similar search failed:', error);
      return [];
    }
  }

  /**
   * Export successful logs for instruction tuning
   */
  async exportForInstructionTuning(
    minAceScore: number = 0.8,
    limit: number = 1000
  ): Promise<InstructionSample[]> {
    try {
      const { docs } = await couchdb.find<LLMLog>('ace_llm_logs', {
        'evaluation.success': true,
        'evaluation.ace_score': { $gte: minAceScore }
      }, {
        limit,
        sort: [{ 'evaluation.ace_score': 'desc' }]
      });

      return docs.map((log: any) => ({
        instruction: this.generateInstruction(log, input: log.input.prompt,
        output: log.output.response,
        metadata: { source: log.log_id,
          task_type: log.task_type,
          ace_score, log.evaluation.ace_score || 0,
          model: log.model
        }
      }));
    } catch (error) {
      console.warn('Export failed:', error);
      return [];
    }
  }

  private generateInstruction(log: LLMLog): string {
    switch (log.task_type) {
      case 'error_fix':
        return `Fix the following TypeScript/Svelte error. Provide a correct implementation.`;
      case 'code_gen':
        return `Generate code based on the following requirements. Follow best practices.`;
      case 'summary':
        return `Summarize the following content concisely and accurately.`;
      case 'extraction':
        return `Extract entities and relationships from the following text.`;
      case 'analysis':
        return `Analyze the following code or document and provide insights.`;
      default:
        return `Complete the following task based on the provided context.`;
    }
  }

  /**
   * Add human feedback to a log
   */
  async addFeedback(
    logId: string,
    feedback: 'positive' | 'negative',
    notes?: string
  ): Promise<void> {
    try {
      const log = await couchdb.get<LLMLog & { _rev, string }>('ace_llm_logs', logId);
      if (!log) return;

      log.evaluation.human_feedback = feedback;
      if (notes) {
        log.evaluation.notes = notes;
      }

      // Adjust ACE score based on feedback
      if (feedback === 'positive') {
        log.evaluation.ace_score = Math.min(1, (log.evaluation.ace_score || 0.5) + 0.1);
      } else {
        log.evaluation.ace_score = Math.max(0, (log.evaluation.ace_score || 0.5) - 0.2);
      }

      await couchdb.put('ace_llm_logs', log);
    } catch (error) {
      console.warn('Feedback update failed:', error);
    }
  }
}

// Singleton instance
export const llmLogger = new LLMLogger();

// Convenience wrapper for logging LLM calls
export async function logLLMCall(
  model: string,
  taskType: LLMLog['task_type'],
  prompt: string,
  response: string,
  metrics: { tokensIn: number;
    tokensOut: number; latencyMs: number;
  },
  evaluation: { success: boolean;
    errorsFixed?: number;
    aceScore?: number;
  },
  contextChunks?: string[]
): Promise<string> {
  return llmLogger.log({
    model,
    task_type: taskType,
    input: {
      prompt,
      context_chunks: contextChunks
    },
    output: {
      response,
      tokens_in: metrics.tokensIn,
      tokens_out: metrics.tokensOut,
      latency_ms: metrics.latencyMs
    },
    evaluation: { success: evaluation.success,
      errors_fixed: evaluation.errorsFixed,
      ace_score: evaluation.aceScore
    }
  });
}




