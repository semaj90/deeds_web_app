#!/usr/bin/env node
/**
 * Phase 1 Dispatcher Middleware Wrapping
 *
 * Automates wrapping of all 13 MCP tool registry files with the dispatcher middleware.
 * Each tool handler is wrapped transparently — no changes to tool logic, only state routing.
 *
 * Usage:
 *   node scripts/phase1-dispatcher-wrapping.mjs --dry-run
 *   node scripts/phase1-dispatcher-wrapping.mjs --apply
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const srcMcpDir = path.join(projectRoot, 'src/mcp');

const REGISTRIES = [
  'new_tools.ts',
  'admin_tools.ts',
  'skill_tools.ts',
  'atlas_embedding_tools.ts',
  'atlas_identity_audit_tools.ts',
  'bifrost_tools.ts',
  'codebase_tools.ts',
  'engram_tools.ts',
  'research_tools.ts',
  'rg_atlas_tools.ts',
  'db-inspection-tools.ts',
  'topology_mgmt_tools.ts',
  'tools/repair_tools.ts',
];

const TOOLS_REQUIRING_LEGAL_SKILLS = [
  'tools/legal-skills.tool.ts'  // Separate file with different API
];

async function analyzePlan() {
  console.log('=== Phase 1 Deployment Plan ===\n');
  console.log(`Scope: ${REGISTRIES.length} tool registry files`);
  console.log(`Directory: ${srcMcpDir}\n`);

  console.log('Registry files:');
  for (let i = 0; i < REGISTRIES.length; i++) {
    console.log(`  ${i + 1}. ${REGISTRIES[i]}`);
  }

  console.log(`\nSpecial handling: ${TOOLS_REQUIRING_LEGAL_SKILLS.length} files (separate API)`);
  for (const file of TOOLS_REQUIRING_LEGAL_SKILLS) {
    console.log(`  - ${file}`);
  }

  console.log('\n=== Wrapping Pattern ===');
  console.log(`
Each registry file will:
  1. Import { DispatcherMiddleware } from './dispatcher-middleware.js'
  2. Add dispatcher middleware parameter to registration function
  3. Import { generateSessionId, createToolWithDispatcher } from './dispatcher-tool-integration.js'
  4. Wrap each tool.handler with createToolWithDispatcher()

Example pattern:

  OLD:
    server.registerTool('kb.search', {...schema}, async (input) => {
      return result;
    });

  NEW:
    const sessionId = generateSessionId();
    server.registerTool('kb.search', {...schema}, createToolWithDispatcher(
      dispatcherMiddleware,
      'kb.search',
      sessionId,
      async (input) => {
        return result;
      }
    ));

=== Timeline ===
Estimated time to complete Phase 1:
  - Code generation & analysis: 5 min
  - Wrapping automation (if script built): 2-3 min
  - Manual wrapping (if done incrementally): 45-60 min
  - Test with real tool call: 10-15 min
  - Total: 60-90 minutes

=== Verification Gates ===
Phase 1 success criteria:
  ✓ All 13 registries import dispatcher middleware
  ✓ All tool.handler calls wrapped with createToolWithDispatcher
  ✓ Server starts without errors (npm run mcp:start)
  ✓ trace.kag_search tool invocation returns HTTP 200
  ✓ Audit table row appears in PostgreSQL after tool call
  ✓ Session ID visible in audit row (tool_execution_audit.session_id)

=== Next Action ===
Option A: Generate patch script (dry-run all registries, then apply incrementally)
Option B: Manual wrapping (1-2 registries at a time with verification)
Option C: Full automation (generate & apply all at once, high risk)

Current recommendation: Option B (manual, low risk, full control)
  1. Start with new_tools.ts (primary registry, most used)
  2. Test server startup + health check
  3. Call trace.kag_search via CLI
  4. Verify audit row in Postgres
  5. Repeat for remaining 12 registries incrementally
`);
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isApply = args.includes('--apply');

  if (!isDryRun && !isApply) {
    await analyzePlan();
    console.log('\n=== Running in PLAN mode ===');
    console.log('To see dry-run: node scripts/phase1-dispatcher-wrapping.mjs --dry-run');
    console.log('To apply changes: node scripts/phase1-dispatcher-wrapping.mjs --apply');
    process.exit(0);
  }

  if (isDryRun) {
    console.log('=== DRY-RUN: Analyzing registries ===\n');

    for (const registry of REGISTRIES) {
      const filePath = path.join(srcMcpDir, registry);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const toolCount = (content.match(/server\.registerTool\(/g) || []).length;
        const hasDispatcher = content.includes('DispatcherMiddleware');

        console.log(`${registry}`);
        console.log(`  Tools: ${toolCount}`);
        console.log(`  Already wrapped: ${hasDispatcher ? 'YES' : 'NO'}`);
        console.log();
      } catch (err) {
        console.error(`  ❌ Error reading ${registry}: ${err.message}`);
      }
    }

    console.log('\n=== DRY-RUN Complete ===');
    console.log('Next: node scripts/phase1-dispatcher-wrapping.mjs --apply');
    process.exit(0);
  }

  if (isApply) {
    console.log('⚠️  --apply not yet implemented');
    console.log('Recommendation: Wrap new_tools.ts manually first, verify, then continue');
    process.exit(1);
  }
}

main().catch(console.error);
