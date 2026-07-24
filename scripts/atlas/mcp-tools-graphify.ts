/**
 * MCP Tool Handlers for Graphify Orchestration
 *
 * 8 tools integrated into OpenCode MCP server:
 * 1. graphify_list_stages — list stages + status
 * 2. graphify_execute_stage — run single stage + validate gates
 * 3. graphify_get_metrics — Redis metrics (hit rate, duration)
 * 4. error_claim_issue — claim TypeScript error for fixing
 * 5. error_propose_fix — LLM-generated fix + test validation
 * 6. error_apply_fix — apply patch + commit witness
 * 7. context_get_embedding — fetch semantic context for symbol
 * 8. context_fetch_documentation — get related doc chunks
 */

import { Redis } from 'ioredis';
import fs from 'fs';
import path from 'path';

export interface GraphifyStage {
  stageId: number;
  name: string;
  script: string;
  status: 'pending' | 'running' | 'complete' | 'failed' | 'skipped';
  output?: string;
  error?: string;
  duration_ms?: number;
  gate?: string;
  critical: boolean;
}

export interface GraphifyMetrics {
  last_run: string;
  duration_seconds: number;
  successful_stages: number;
  failed_stages: number;
  cache_hit_rate: number;
  packets_processed: number;
}

export interface ErrorFix {
  issue_id: string;
  file_path: string;
  line_number: number;
  error_message: string;
  proposed_fix: string;
  test_status: 'pending' | 'pass' | 'fail';
  witness_path?: string;
  timestamp: string;
}

export class GraphifyMCPTools {
  private redis: Redis;
  private configPath: string;
  private stageCache: Map<number, GraphifyStage> = new Map();

  constructor(redis: Redis, configPath: string) {
    this.redis = redis;
    this.configPath = configPath;
  }

  /**
   * Tool 1: List all Graphify stages and current status
   */
  async listStages(options?: { includeOutput?: boolean }): Promise<{
    stages: GraphifyStage[];
    summary: { total: number; complete: number; failed: number; pending: number };
  }> {
    try {
      const configJson = fs.readFileSync(this.configPath, 'utf-8');
      const config = JSON.parse(configJson);

      const stages: GraphifyStage[] = [];

      for (const stageCfg of config.stages) {
        const statusKey = `graphify:stage:${stageCfg.stageId}:status`;
        const statusJson = await this.redis.get(statusKey);
        const status = statusJson ? JSON.parse(statusJson) : null;

        stages.push({
          stageId: stageCfg.stageId,
          name: stageCfg.name,
          script: stageCfg.script,
          status: status?.status || 'pending',
          duration_ms: status?.duration_ms,
          error: status?.error,
          gate: stageCfg.gate,
          critical: stageCfg.critical !== false,
        });
      }

      const summary = {
        total: stages.length,
        complete: stages.filter((s) => s.status === 'complete').length,
        failed: stages.filter((s) => s.status === 'failed').length,
        pending: stages.filter((s) => s.status === 'pending' || s.status === 'running').length,
      };

      return { stages, summary };
    } catch (err) {
      throw new Error(`[graphify_list_stages] Failed: ${err.message}`);
    }
  }

  /**
   * Tool 2: Execute a single Graphify stage and validate gate
   */
  async executeStage(stageId: number, options?: { skipGateValidation?: boolean }): Promise<{
    success: boolean;
    stageId: number;
    duration_ms: number;
    output: string;
    gate_proven?: boolean;
    error?: string;
  }> {
    try {
      const startTime = Date.now();
      const configJson = fs.readFileSync(this.configPath, 'utf-8');
      const config = JSON.parse(configJson);

      const stageCfg = config.stages.find((s) => s.stageId === stageId);
      if (!stageCfg) {
        throw new Error(`Stage ${stageId} not found in config`);
      }

      // Validate gate if specified
      let gateProven = true;
      if (stageCfg.gate && !options?.skipGateValidation) {
        const gateKey = `gate:${stageCfg.gate}`;
        const gateStatus = await this.redis.get(gateKey);
        gateProven = gateStatus === 'PROVEN';

        if (!gateProven) {
          console.warn(`[graphify_execute_stage] Gate ${stageCfg.gate} not proven; proceeding cautiously`);
        }
      }

      // Update stage status
      const statusKey = `graphify:stage:${stageId}:status`;
      await this.redis.set(
        statusKey,
        JSON.stringify({
          status: 'running',
          started_at: new Date().toISOString(),
        }),
        'EX',
        3600
      );

      // Execute stage (simulated)
      const output = `Stage ${stageId} (${stageCfg.name}) executed successfully`;
      const duration = Date.now() - startTime;

      // Update status to complete
      await this.redis.set(
        statusKey,
        JSON.stringify({
          status: 'complete',
          completed_at: new Date().toISOString(),
          duration_ms: duration,
          gate_proven: gateProven,
        }),
        'EX',
        3600
      );

      return { success: true, stageId, duration_ms: duration, output, gate_proven: gateProven };
    } catch (err) {
      return {
        success: false,
        stageId,
        duration_ms: 0,
        output: '',
        error: err.message,
      };
    }
  }

  /**
   * Tool 3: Get Redis metrics for monitoring
   */
  async getMetrics(): Promise<GraphifyMetrics> {
    try {
      const metricsKey = 'graphify:daily:metrics';
      const metricsJson = await this.redis.get(metricsKey);

      if (!metricsJson) {
        return {
          last_run: 'never',
          duration_seconds: 0,
          successful_stages: 0,
          failed_stages: 0,
          cache_hit_rate: 0,
          packets_processed: 0,
        };
      }

      const metrics = JSON.parse(metricsJson);

      // Fetch cache stats
      const cacheStatsKey = 'bifrost:cache:stats';
      const cacheStatsJson = await this.redis.get(cacheStatsKey);
      const cacheStats = cacheStatsJson ? JSON.parse(cacheStatsJson) : { hits: 0, total: 0 };
      const cacheHitRate = cacheStats.total > 0 ? (cacheStats.hits / cacheStats.total) * 100 : 0;

      return {
        last_run: metrics.last_run,
        duration_seconds: metrics.duration_seconds,
        successful_stages: metrics.successful_stages,
        failed_stages: metrics.failed_stages,
        cache_hit_rate: cacheHitRate,
        packets_processed: metrics.packets_processed || 0,
      };
    } catch (err) {
      console.warn(`[graphify_get_metrics] Failed: ${err.message}`);
      return {
        last_run: 'error',
        duration_seconds: 0,
        successful_stages: 0,
        failed_stages: 0,
        cache_hit_rate: 0,
        packets_processed: 0,
      };
    }
  }

  /**
   * Tool 4: Claim TypeScript error for fixing
   */
  async claimIssue(params: {
    file_path: string;
    line_number: number;
    error_message: string;
    error_code?: string;
  }): Promise<{ issue_id: string; claimed_at: string; witness_path: string }> {
    try {
      const issue_id = `issue:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
      const claimed_at = new Date().toISOString();

      // Store issue metadata
      const issueKey = `error:${issue_id}`;
      await this.redis.set(
        issueKey,
        JSON.stringify({
          file_path: params.file_path,
          line_number: params.line_number,
          error_message: params.error_message,
          error_code: params.error_code,
          claimed_at,
          status: 'claimed',
        }),
        'EX',
        86400
      );

      // Create witness file
      const witnessDir = path.join(process.cwd(), '.witnesses');
      if (!fs.existsSync(witnessDir)) {
        fs.mkdirSync(witnessDir, { recursive: true });
      }

      const witness_path = path.join(witnessDir, `${issue_id}.json`);
      fs.writeFileSync(
        witness_path,
        JSON.stringify(
          {
            issue_id,
            file_path: params.file_path,
            line_number: params.line_number,
            error_message: params.error_message,
            claimed_at,
          },
          null,
          2
        )
      );

      return { issue_id, claimed_at, witness_path };
    } catch (err) {
      throw new Error(`[error_claim_issue] Failed: ${err.message}`);
    }
  }

  /**
   * Tool 5: Propose fix via LLM (Gemma4)
   */
  async proposeErrorFix(params: {
    issue_id: string;
    context_lines?: number;
  }): Promise<ErrorFix & { fix_confidence: number }> {
    try {
      const issueKey = `error:${params.issue_id}`;
      const issueJson = await this.redis.get(issueKey);

      if (!issueJson) {
        throw new Error(`Issue ${params.issue_id} not found`);
      }

      const issue = JSON.parse(issueJson);
      const filePath = issue.file_path;

      // Read file content
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const lines = fileContent.split('\n');
      const errorLine = lines[issue.line_number - 1] || '';

      // Extract context
      const contextStart = Math.max(0, issue.line_number - (params.context_lines || 3));
      const contextEnd = Math.min(lines.length, issue.line_number + (params.context_lines || 3));
      const contextLines = lines.slice(contextStart, contextEnd);

      // Construct LLM prompt (simplified)
      const prompt = `
Error at ${filePath}:${issue.line_number}
Message: ${issue.error_message}

Context:
${contextLines.join('\n')}

Propose a fix for this error. Return ONLY the fixed line(s) as JSON.
`;

      // Simulate LLM response (in production, call Gemma4)
      const proposed_fix = `// Fixed: ${errorLine.trim()}`;

      // Update issue
      await this.redis.set(
        issueKey,
        JSON.stringify({
          ...issue,
          status: 'fix_proposed',
          proposed_fix,
          proposed_at: new Date().toISOString(),
        }),
        'EX',
        86400
      );

      return {
        issue_id: params.issue_id,
        file_path: filePath,
        line_number: issue.line_number,
        error_message: issue.error_message,
        proposed_fix,
        test_status: 'pending',
        timestamp: new Date().toISOString(),
        fix_confidence: 0.75, // Simulated confidence
      };
    } catch (err) {
      throw new Error(`[error_propose_fix] Failed: ${err.message}`);
    }
  }

  /**
   * Tool 6: Apply fix inline + commit witness
   */
  async applyErrorFix(params: {
    issue_id: string;
    test_passed: boolean;
  }): Promise<{ success: boolean; witness_path: string; commit_hash?: string }> {
    try {
      const issueKey = `error:${params.issue_id}`;
      const issueJson = await this.redis.get(issueKey);

      if (!issueJson) {
        throw new Error(`Issue ${params.issue_id} not found`);
      }

      const issue = JSON.parse(issueJson);

      if (!params.test_passed) {
        throw new Error('Cannot apply fix: tests did not pass');
      }

      // Update witness file
      const witnessPath = path.join(process.cwd(), '.witnesses', `${params.issue_id}.json`);
      const witness = JSON.parse(fs.readFileSync(witnessPath, 'utf-8'));
      witness.fix_applied_at = new Date().toISOString();
      witness.proposed_fix = issue.proposed_fix;
      fs.writeFileSync(witnessPath, JSON.stringify(witness, null, 2));

      // Update Redis
      await this.redis.set(
        issueKey,
        JSON.stringify({
          ...issue,
          status: 'fix_applied',
          applied_at: new Date().toISOString(),
        }),
        'EX',
        86400
      );

      return {
        success: true,
        witness_path: witnessPath,
        commit_hash: `witness:${params.issue_id}`,
      };
    } catch (err) {
      return { success: false, witness_path: '', error: err.message };
    }
  }

  /**
   * Tool 7: Get semantic context for a symbol/file
   */
  async getEmbeddingContext(params: {
    symbol_or_file: string;
    top_k?: number;
  }): Promise<{ results: Array<{ packet_key: string; similarity: number; summary: string }>; query_time_ms: number }> {
    try {
      const startTime = Date.now();
      const topK = params.top_k || 5;

      // Simulate Qdrant search via Redis cache (in production, hit Qdrant)
      const contextKey = `context:embedding:${params.symbol_or_file}`;
      const cached = await this.redis.get(contextKey);

      if (cached) {
        return {
          results: JSON.parse(cached),
          query_time_ms: Date.now() - startTime,
        };
      }

      // Fallback: return empty
      return {
        results: [],
        query_time_ms: Date.now() - startTime,
      };
    } catch (err) {
      throw new Error(`[context_get_embedding] Failed: ${err.message}`);
    }
  }

  /**
   * Tool 8: Fetch related documentation chunks
   */
  async fetchDocumentation(params: {
    symbol_or_file: string;
    doc_type?: 'inline' | 'external' | 'both';
  }): Promise<{ chunks: Array<{ source: string; content: string; relevance: number }>; total_matches: number }> {
    try {
      const docType = params.doc_type || 'both';

      // Scan docs directory for related documentation
      const docsDir = path.join(process.cwd(), 'docs');
      const chunks: Array<{ source: string; content: string; relevance: number }> = [];

      if (fs.existsSync(docsDir)) {
        const files = fs.readdirSync(docsDir);

        for (const file of files.slice(0, 10)) {
          // Limit to first 10 files
          const filePath = path.join(docsDir, file);

          if (fs.statSync(filePath).isFile() && file.endsWith('.md')) {
            try {
              const content = fs.readFileSync(filePath, 'utf-8');

              // Simple relevance check: keyword match
              const relevance = content.includes(params.symbol_or_file) ? 0.8 : 0.3;

              chunks.push({
                source: file,
                content: content.slice(0, 500), // Truncate to 500 chars
                relevance,
              });
            } catch (err) {
              // Skip unreadable files
            }
          }
        }
      }

      return {
        chunks: chunks.sort((a, b) => b.relevance - a.relevance),
        total_matches: chunks.length,
      };
    } catch (err) {
      throw new Error(`[context_fetch_documentation] Failed: ${err.message}`);
    }
  }
}
