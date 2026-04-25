#!/usr/bin/env node
/**
 * Phase 78: Retrieve AI-generated patches from error_suggestions table
 * Exports patches to JSON/markdown files for review and application
 */

import { writeFileSync } from 'fs';
import postgres from 'postgres';

// Database connection
const sql = postgres(process.env.DATABASE_URL || 'postgresql://legal_admin:legalai2024@localhost:5432/legal_ai_db', {
  max: 2,
  idle_timeout: 20,
  connect_timeout: 10
});

async function main() {
  try {
    const routePath = process.argv[2] || '/cases/[id]/overview';

    console.log(`\n🔍 Retrieving AI-generated fixes for: ${routePath}\n`);

    // Get all suggestions for the route
    const suggestions = await sql`
      SELECT
        id::text,
        route_path,
        summary,
        patch,
        risk_level,
        source,
        created_at,
        cluster_id,
        error_event_id
      FROM error_suggestions
      WHERE route_path = ${routePath}
      ORDER BY
        CASE risk_level
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 3
        END,
        created_at DESC
    `;

    if (suggestions.length === 0) {
      console.log('❌ No suggestions found for this route');
      process.exit(1);
    }

    console.log(`✅ Found ${suggestions.length} suggestions:\n`);

    // Display summary
    suggestions.forEach((s, idx) => {
      const riskBadge = {
        high: '🔴',
        medium: '🟡',
        low: '🟢'
      }[s.risk_level] || '⚪';

      console.log(`${idx + 1}. ${riskBadge} [${s.risk_level.toUpperCase()}] ${s.id.substring(0, 8)}`);
      console.log(`   ${s.summary}`);
      console.log('');
    });

    // Export to JSON
    const jsonOutput = {
      route: routePath,
      timestamp: new Date().toISOString(),
      count: suggestions.length,
      suggestions: suggestions.map(s => ({
        id: s.id,
        risk_level: s.risk_level,
        summary: s.summary,
        patch: s.patch,
        source: s.source,
        cluster_id: s.cluster_id,
        error_event_id: s.error_event_id,
        created_at: s.created_at
      }))
    };

    const jsonPath = 'phase78-patches.json';
    writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
    console.log(`📄 Exported to: ${jsonPath}\n`);

    // Export to markdown
    let markdown = `# Phase 78 AI-Generated Fixes\n\n`;
    markdown += `**Route:** \`${routePath}\`  \n`;
    markdown += `**Generated:** ${new Date().toISOString()}  \n`;
    markdown += `**Total Suggestions:** ${suggestions.length}\n\n`;
    markdown += `---\n\n`;

    suggestions.forEach((s, idx) => {
      const riskBadge = {
        high: '🔴 HIGH RISK',
        medium: '🟡 MEDIUM RISK',
        low: '🟢 LOW RISK'
      }[s.risk_level] || '⚪ UNKNOWN';

      markdown += `## ${idx + 1}. ${riskBadge}\n\n`;
      markdown += `**ID:** \`${s.id}\`  \n`;
      markdown += `**Summary:** ${s.summary}\n\n`;
      markdown += `**Cluster:** \`${s.cluster_id || 'N/A'}\`  \n`;
      markdown += `**Source:** ${s.source}  \n`;
      markdown += `**Created:** ${s.created_at}\n\n`;
      markdown += `### Patch\n\n`;
      markdown += `${s.patch}\n\n`;
      markdown += `---\n\n`;
    });

    const mdPath = 'phase78-patches.md';
    writeFileSync(mdPath, markdown);
    console.log(`📝 Exported to: ${mdPath}\n`);

    console.log(`\n✅ Export complete! Review the patches before applying.\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
