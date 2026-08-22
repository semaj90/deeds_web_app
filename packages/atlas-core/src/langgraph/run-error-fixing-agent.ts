#!/usr/bin/env node

/**
 * Run Error-Fixing Kanban Agent via LangGraph
 *
 * Usage:
 *   npx tsx src/langgraph/run-error-fixing-agent.ts [--dry-run] [--verbose]
 */

import { buildErrorFixingGraph } from './kanban-error-fixing-agent.js';

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isVerbose = args.includes('--verbose');

  if (isVerbose) {
    console.log('🚀 Starting Error-Fixing Kanban Agent');
    console.log(`   Dry-run: ${isDryRun ? 'yes' : 'no'}`);
    console.log(`   Verbose: ${isVerbose ? 'yes' : 'no'}\n`);
  }

  try {
    // Build the LangGraph workflow
    const graph = buildErrorFixingGraph();

    // Initial state
    const initialState = {
      trace_id: `error-fixing-${Date.now()}`,
      packets: undefined,
      classified_tasks: undefined,
      kanban_tasks: undefined,
      policy_scores: undefined,
      fixes: undefined,
      completed_count: 0,
      failed_count: 0,
      error: undefined
    };

    if (isVerbose) {
      console.log('📋 Initial state:');
      console.log(`   Trace ID: ${initialState.trace_id}\n`);
    }

    // Invoke the graph
    console.log('⏳ Running error-fixing workflow...\n');
    const result = await graph.invoke(initialState);

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 ERROR-FIXING KANBAN AGENT SUMMARY');
    console.log('='.repeat(70));

    if (result.error) {
      console.log(`\n❌ Error: ${result.error}`);
    } else {
      console.log(`\n✅ Trace ID: ${result.trace_id}`);
      console.log(`✅ Packets loaded: ${result.packets?.length ?? 0}`);
      console.log(`✅ Kanban tasks created: ${result.kanban_tasks?.length ?? 0}`);
      console.log(`✅ Error fixes suggested: ${result.fixes?.length ?? 0}`);
      console.log(`✅ Tasks in-progress: ${result.completed_count}`);
      console.log(`⚠️  Tasks failed: ${result.failed_count}`);

      if (result.fixes && result.fixes.length > 0) {
        console.log('\n📝 Sample Fixes:');
        for (const fix of result.fixes.slice(0, 3)) {
          console.log(`\n   Packet: ${fix.packet_key}`);
          console.log(`   Error: ${fix.error_type} (${fix.error_location})`);
          console.log(`   Fix: ${fix.suggested_fix}`);
          console.log(`   Confidence: ${(fix.confidence * 100).toFixed(1)}%`);
        }
      }
    }

    console.log('\n' + '='.repeat(70));

    if (isDryRun) {
      console.log('🔄 Dry-run mode: no changes committed');
    } else {
      console.log('✨ Error-fixing workflow complete');
    }

    console.log('='.repeat(70) + '\n');

    process.exit(result.error ? 1 : 0);
  } catch (err) {
    console.error('\n❌ Workflow failed:', err);
    process.exit(1);
  }
}

main();
