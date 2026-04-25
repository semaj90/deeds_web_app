#!/usr/bin/env node
// Phase 89: Error-Fixing Knowledge Consolidator
// Learns from successful fixes to improve future autonomous repairs
// Extracts patterns, creates solution templates, builds confidence scores

import { writeFile } from 'fs/promises';
import pg from 'pg';
import { redisFromEnv, setJson } from './lib/phase89-cache.mjs';
import { embedCached } from './lib/phase89-embed.mjs';

const { Pool } = pg;

class ErrorFixingKnowledgeConsolidator {
  constructor() {
    this.pgPool = null;
    this.redis = null;
    this.model = process.env.EMBEDDING_MODEL || 'embeddinggemma:latest';
    this.learnings = [];
  }

  async connect() {
    this.pgPool = new Pool({
      host: 'localhost',
      port: 5434,
      database: 'legal_ai_db',
      user: 'legal_admin',
      password: '123456'
    });

    this.redis = await redisFromEnv();
    console.log('✅ Connected to Postgres & Redis\n');
  }

  /**
   * Ensure schema for fix tracking
   */
  async ensureSchema() {
    // Table for successful fixes
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS error_fix_history (
        id SERIAL PRIMARY KEY,
        error_id INTEGER REFERENCES raw_error_embeddings(id),
        error_code TEXT NOT NULL,
        error_message TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line_number INTEGER,

        -- Fix details
        fix_strategy TEXT NOT NULL,
        fix_content TEXT NOT NULL,
        fix_diff TEXT,

        -- Context
        surrounding_code TEXT,
        file_type TEXT,
        tags TEXT[],

        -- Validation
        validated BOOLEAN DEFAULT false,
        validation_method TEXT,
        success_score FLOAT DEFAULT 0.0,

        -- Metadata
        fixed_at TIMESTAMPTZ DEFAULT NOW(),
        fixed_by TEXT DEFAULT 'autonomous',
        llm_provider TEXT,
        llm_model TEXT,
        prompt_tokens INTEGER,
        completion_tokens INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_fix_error_code ON error_fix_history(error_code);
      CREATE INDEX IF NOT EXISTS idx_fix_validated ON error_fix_history(validated);
      CREATE INDEX IF NOT EXISTS idx_fix_score ON error_fix_history(success_score);
    `);

    // Table for learned patterns
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS learned_fix_patterns (
        id SERIAL PRIMARY KEY,
        pattern_name TEXT UNIQUE NOT NULL,
        error_code TEXT NOT NULL,

        -- Pattern details
        description TEXT,
        trigger_conditions JSONB,
        solution_template TEXT NOT NULL,

        -- Confidence
        times_applied INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        confidence_score FLOAT DEFAULT 0.0,

        -- Context
        applicable_file_types TEXT[],
        required_tags TEXT[],

        -- Embedding for similarity search
        pattern_embedding vector(768),

        -- Metadata
        learned_at TIMESTAMPTZ DEFAULT NOW(),
        last_applied TIMESTAMPTZ,
        last_updated TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_pattern_error_code ON learned_fix_patterns(error_code);
      CREATE INDEX IF NOT EXISTS idx_pattern_confidence ON learned_fix_patterns(confidence_score);
    `);

    // Table for knowledge base updates
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS kb_update_log (
        id SERIAL PRIMARY KEY,
        update_type TEXT NOT NULL, -- 'pattern_added', 'pattern_updated', 'playbook_created'
        entity_id INTEGER,
        entity_type TEXT,
        description TEXT,
        metadata JSONB,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  }

  /**
   * Record a successful fix
   */
  async recordFix(fixData) {
    const result = await this.pgPool.query(
      `INSERT INTO error_fix_history
       (error_id, error_code, error_message, file_path, line_number,
        fix_strategy, fix_content, fix_diff, surrounding_code, file_type, tags,
        validated, validation_method, success_score,
        llm_provider, llm_model, prompt_tokens, completion_tokens)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING id`,
      [
        fixData.errorId,
        fixData.errorCode,
        fixData.errorMessage,
        fixData.filePath,
        fixData.lineNumber,
        fixData.strategy,
        fixData.content,
        fixData.diff,
        fixData.surroundingCode,
        fixData.fileType,
        fixData.tags,
        fixData.validated || false,
        fixData.validationMethod || null,
        fixData.successScore || 0.0,
        fixData.llmProvider || 'ollama',
        fixData.llmModel || 'gemma3-legal:latest',
        fixData.promptTokens || 0,
        fixData.completionTokens || 0
      ]
    );

    return result.rows[0].id;
  }

  /**
   * Extract patterns from successful fixes
   */
  async extractPatterns(minSuccesses = 3) {
    console.log(`🧠 Extracting fix patterns (min ${minSuccesses} successes)...\n`);

    // Group fixes by error code
    const result = await this.pgPool.query(
      `SELECT
         error_code,
         fix_strategy,
         COUNT(*) as times_used,
         AVG(success_score) as avg_score,
         array_agg(DISTINCT file_type) as file_types,
         array_agg(tags) as all_tags,
         array_agg(fix_content) as fix_contents
       FROM error_fix_history
       WHERE validated = true AND success_score > 0.7
       GROUP BY error_code, fix_strategy
       HAVING COUNT(*) >= $1
       ORDER BY COUNT(*) DESC`,
      [minSuccesses]
    );

    console.log(`   Found ${result.rows.length} potential patterns\n`);

    for (const row of result.rows) {
      // Create pattern name
      const patternName = `${row.error_code}_${row.fix_strategy}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');

      // Extract common solution template
      const template = this.createTemplate(row.fix_contents);

      // Flatten and deduplicate tags
      const allTags = row.all_tags.flat().filter(Boolean);
      const uniqueTags = [...new Set(allTags)];

      // Generate pattern embedding
      const patternText = `${row.error_code} ${row.fix_strategy} ${template}`;
      const embeddingResult = await embedCached(patternText, this.model, this.redis);

      // Calculate confidence (based on success rate and frequency)
      const confidence = Math.min(row.avg_score * (row.times_used / (row.times_used + 10)), 1.0);

      // Upsert pattern
      await this.pgPool.query(
        `INSERT INTO learned_fix_patterns
         (pattern_name, error_code, description, solution_template,
          times_applied, success_count, confidence_score,
          applicable_file_types, required_tags, pattern_embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (pattern_name)
         DO UPDATE SET
           times_applied = EXCLUDED.times_applied,
           success_count = EXCLUDED.success_count,
           confidence_score = EXCLUDED.confidence_score,
           last_updated = NOW()`,
        [
          patternName,
          row.error_code,
          `Auto-learned pattern for ${row.error_code} using ${row.fix_strategy}`,
          template,
          row.times_used,
          row.times_used, // All validated fixes are successes
          confidence,
          row.file_types,
          uniqueTags,
          JSON.stringify(embeddingResult.embedding)
        ]
      );

      // Log KB update
      await this.pgPool.query(
        `INSERT INTO kb_update_log (update_type, entity_type, description, metadata)
         VALUES ('pattern_added', 'learned_fix_pattern', $1, $2)`,
        [
          `Pattern: ${patternName}`,
          JSON.stringify({ confidence, timesApplied: row.times_used })
        ]
      );

      console.log(`   ✅ Pattern: ${patternName} (confidence: ${(confidence * 100).toFixed(1)}%)`);
    }

    console.log(`\n✅ Extracted ${result.rows.length} patterns\n`);
  }

  /**
   * Create a solution template from multiple fixes
   */
  createTemplate(fixContents) {
    // Find common structure across fixes
    // For now, use the most common fix (could use LLM to generalize)

    const fixCounts = new Map();
    for (const fix of fixContents) {
      fixCounts.set(fix, (fixCounts.get(fix) || 0) + 1);
    }

    // Get most common fix
    let maxCount = 0;
    let template = '';
    for (const [fix, count] of fixCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        template = fix;
      }
    }

    // Generalize template (replace specific values with placeholders)
    template = template
      .replace(/\b\d+\b/g, '<NUMBER>')
      .replace(/['"`]([^'"`]+)['"`]/g, '<STRING>');

    return template;
  }

  /**
   * Generate playbooks for common error clusters
   */
  async generatePlaybooks(outputDir = './playbooks') {
    console.log(`📚 Generating error-fixing playbooks...\n`);

    // Get top error codes by fix count
    const result = await this.pgPool.query(
      `SELECT
         error_code,
         COUNT(*) as fix_count,
         AVG(success_score) as avg_success,
         array_agg(DISTINCT fix_strategy) as strategies
       FROM error_fix_history
       WHERE validated = true
       GROUP BY error_code
       HAVING COUNT(*) >= 5
       ORDER BY COUNT(*) DESC
       LIMIT 10`
    );

    for (const row of result.rows) {
      const playbookPath = `${outputDir}/${row.error_code.toLowerCase()}-playbook.md`;

      // Get detailed fixes for this error code
      const fixes = await this.pgPool.query(
        `SELECT fix_strategy, fix_content, surrounding_code, success_score
         FROM error_fix_history
         WHERE error_code = $1 AND validated = true
         ORDER BY success_score DESC
         LIMIT 5`,
        [row.error_code]
      );

      // Generate markdown playbook
      let playbook = `# ${row.error_code} Fix Playbook\n\n`;
      playbook += `**Auto-generated from ${row.fix_count} successful fixes**\n\n`;
      playbook += `**Average Success Rate**: ${(row.avg_success * 100).toFixed(1)}%\n\n`;
      playbook += `## Strategies\n\n`;

      for (const strategy of row.strategies) {
        playbook += `- ${strategy}\n`;
      }

      playbook += `\n## Example Fixes\n\n`;

      for (let i = 0; i < fixes.rows.length; i++) {
        const fix = fixes.rows[i];
        playbook += `### Fix ${i + 1}: ${fix.fix_strategy}\n\n`;
        playbook += `**Success Score**: ${(fix.success_score * 100).toFixed(1)}%\n\n`;
        playbook += `\`\`\`typescript\n${fix.fix_content}\n\`\`\`\n\n`;
      }

      playbook += `## Notes\n\n`;
      playbook += `- This playbook is automatically updated as new fixes are validated\n`;
      playbook += `- Confidence scores improve with more successful applications\n`;

      await writeFile(playbookPath, playbook);

      // Embed playbook for retrieval
      const embeddingResult = await embedCached(playbook, this.model, this.redis);

      // Store in KB
      await this.pgPool.query(
        `INSERT INTO raw_error_embeddings
         (source, file_path, line, error_code, message, raw_text, embedding, tags)
         VALUES ('playbook', $1, 0, $2, $3, $4, $5, $6)
         ON CONFLICT (source, file_path, line, content_hash) DO NOTHING`,
        [
          playbookPath,
          row.error_code,
          `Playbook for ${row.error_code}`,
          playbook,
          JSON.stringify(embeddingResult.embedding),
          ['playbook', 'auto-generated', row.error_code]
        ]
      );

      console.log(`   ✅ ${playbookPath}`);
    }

    console.log(`\n✅ Generated ${result.rows.length} playbooks\n`);
  }

  /**
   * Update RAG/KAG with new learnings
   */
  async updateKnowledgeBase() {
    console.log(`🔄 Updating knowledge base with learnings...\n`);

    // Get recent patterns
    const patterns = await this.pgPool.query(
      `SELECT pattern_name, error_code, solution_template, confidence_score
       FROM learned_fix_patterns
       WHERE confidence_score > 0.5
       ORDER BY last_updated DESC
       LIMIT 50`
    );

    // Cache patterns in Redis for fast retrieval
    for (const pattern of patterns.rows) {
      const key = `pattern:${pattern.error_code}:${pattern.pattern_name}`;
      await setJson(this.redis, key, pattern, 86400 * 7); // 7 day TTL
    }

    console.log(`   ✅ Cached ${patterns.rows.length} patterns in Redis\n`);

    // Update KB statistics
    const stats = await this.pgPool.query(
      `SELECT
         COUNT(DISTINCT error_code) as error_types,
         COUNT(*) as total_patterns,
         AVG(confidence_score) as avg_confidence,
         SUM(times_applied) as total_applications
       FROM learned_fix_patterns`
    );

    console.log(`📊 Knowledge Base Stats:`);
    console.log(`   Error types: ${stats.rows[0].error_types}`);
    console.log(`   Total patterns: ${stats.rows[0].total_patterns}`);
    console.log(`   Avg confidence: ${(stats.rows[0].avg_confidence * 100).toFixed(1)}%`);
    console.log(`   Total applications: ${stats.rows[0].total_applications}\n`);
  }

  /**
   * Query learned patterns for an error
   */
  async getPatternForError(errorCode, context = {}) {
    const result = await this.pgPool.query(
      `SELECT pattern_name, solution_template, confidence_score, times_applied
       FROM learned_fix_patterns
       WHERE error_code = $1
       ORDER BY confidence_score DESC, times_applied DESC
       LIMIT 1`,
      [errorCode]
    );

    if (result.rows.length === 0) return null;

    return result.rows[0];
  }

  async close() {
    await this.pgPool?.end();
    await this.redis?.quit();
  }
}

// Main execution
const consolidator = new ErrorFixingKnowledgeConsolidator();

try {
  await consolidator.connect();
  await consolidator.ensureSchema();

  const command = process.argv[2] || 'extract';

  switch (command) {
    case 'extract':
      await consolidator.extractPatterns();
      break;

    case 'playbooks':
      await consolidator.generatePlaybooks('./playbooks');
      break;

    case 'update':
      await consolidator.updateKnowledgeBase();
      break;

    case 'full':
      await consolidator.extractPatterns();
      await consolidator.generatePlaybooks('./playbooks');
      await consolidator.updateKnowledgeBase();
      break;

    default:
      console.log('Usage: node phase89-knowledge-consolidator.mjs [extract|playbooks|update|full]');
  }

} catch (error) {
  console.error('❌ Fatal error:', error);
  process.exit(1);
} finally {
  await consolidator.close();
}
