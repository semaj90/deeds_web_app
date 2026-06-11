#!/usr/bin/env node

/**
 * Phase 3E.1: Generate Concept Temperature Report
 *
 * Creates concept-temperature-report.json and .md with:
 * - Lifecycle distribution (ACTIVE/WARM/COOL/COLD/ARCHIVED)
 * - Strategy breakdown (which lanes produce hot concepts)
 * - Top-5 concepts by temperature
 * - Archive candidates (T < 0.2, no retrievals in 60 days)
 */

import pg from 'pg';
import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:legal_password@127.0.0.1:5434/legal_ai_db';
const REPORT_DIR = resolve(__dirname, '../../docs/reports');

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    console.log('[Phase 3E.1] Generating concept temperature report...');

    const conceptsResult = await pool.query(`
      select
        concept_id,
        label,
        concept_temperature,
        retrieval_count,
        last_retrieved_at,
        repair_success,
        success_count,
        failure_count,
        strategy_distribution
      from concept_records
      order by concept_temperature desc
    `);

    const concepts = conceptsResult.rows;

    const active = concepts.filter(c => c.concept_temperature >= 0.8).length;
    const warm = concepts.filter(c => c.concept_temperature >= 0.5 && c.concept_temperature < 0.8).length;
    const cool = concepts.filter(c => c.concept_temperature >= 0.2 && c.concept_temperature < 0.5).length;
    const cold = concepts.filter(c => c.concept_temperature > 0 && c.concept_temperature < 0.2).length;

    const archiveCandidates = concepts.filter(c => {
      if (c.concept_temperature >= 0.2) return false;
      if (!c.last_retrieved_at) return true;
      const daysSince = (Date.now() - new Date(c.last_retrieved_at).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 60;
    }).length;

    const strategyTotals = {};
    for (const concept of concepts) {
      const dist = concept.strategy_distribution || {};
      for (const [strategy, count] of Object.entries(dist)) {
        strategyTotals[strategy] = (strategyTotals[strategy] || 0) + count;
      }
    }

    const totalRetrievals = Object.values(strategyTotals).reduce((a, b) => a + b, 0);

    const jsonReport = {
      timestamp: new Date().toISOString(),
      summary: {
        totalConcepts: concepts.length,
        averageTemperature: (concepts.reduce((sum, c) => sum + c.concept_temperature, 0) / concepts.length).toFixed(3),
        totalRetrievals,
      },
      lifecycle: {
        ACTIVE: { count: active, threshold: '≥ 0.8' },
        WARM: { count: warm, threshold: '0.5–0.79' },
        COOL: { count: cool, threshold: '0.2–0.49' },
        COLD: { count: cold, threshold: '0.01–0.19' },
        ARCHIVE_CANDIDATES: { count: archiveCandidates },
      },
      strategies: strategyTotals,
      topConcepts: concepts.slice(0, 10).map(c => ({
        concept_id: c.concept_id,
        temperature: c.concept_temperature.toFixed(3),
        retrievals: c.retrieval_count,
        strategy_distribution: c.strategy_distribution,
      })),
    };

    const jsonPath = resolve(REPORT_DIR, 'concept-temperature-report.json');
    fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
    console.log(`[Phase 3E.1] JSON report: ${jsonPath}`);

    let markdown = `# Concept Temperature Report\n\n`;
    markdown += `**Generated**: ${new Date().toISOString()}\n\n`;
    markdown += `## Lifecycle Distribution\n\n`;
    markdown += `| State | Count | % |\n|-------|-------|---|\n`;
    markdown += `| ACTIVE | ${active} | ${((active / concepts.length) * 100).toFixed(1)}% |\n`;
    markdown += `| WARM | ${warm} | ${((warm / concepts.length) * 100).toFixed(1)}% |\n`;
    markdown += `| COOL | ${cool} | ${((cool / concepts.length) * 100).toFixed(1)}% |\n`;
    markdown += `| COLD | ${cold} | ${((cold / concepts.length) * 100).toFixed(1)}% |\n`;
    markdown += `| Archive Candidates | ${archiveCandidates} | ${((archiveCandidates / concepts.length) * 100).toFixed(1)}% |\n\n`;

    markdown += `## Strategy Breakdown\n\n`;
    markdown += `| Strategy | Count | % |\n|----------|-------|---|\n`;
    for (const [strategy, count] of Object.entries(strategyTotals).sort((a, b) => b[1] - a[1])) {
      markdown += `| \`${strategy}\` | ${count} | ${((count / totalRetrievals) * 100).toFixed(1)}% |\n`;
    }
    markdown += '\n';

    markdown += `## Top 10 Hot Concepts\n\n`;
    for (const concept of concepts.slice(0, 10)) {
      const successRate = ((concept.success_count / (concept.success_count + concept.failure_count)) * 100).toFixed(1);
      markdown += `### ${concept.concept_id}\n`;
      markdown += `- **Temp**: ${concept.concept_temperature.toFixed(3)} | **Retrievals**: ${concept.retrieval_count} | **Success**: ${successRate}%\n`;
      markdown += `- **Discovered via**: `;
      const dist = concept.strategy_distribution || {};
      markdown += Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([s, c]) => `${s} (${c})`).join(', ');
      markdown += '\n\n';
    }

    const mdPath = resolve(REPORT_DIR, 'concept-temperature-report.md');
    fs.writeFileSync(mdPath, markdown);
    console.log(`[Phase 3E.1] Markdown report: ${mdPath}`);

    console.log(`[Phase 3E.1] Report generation complete ✅`);
  } catch (err) {
    console.error('[Phase 3E.1] Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
