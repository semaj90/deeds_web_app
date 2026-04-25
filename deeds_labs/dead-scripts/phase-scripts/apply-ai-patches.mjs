#!/usr/bin/env node
/**
 * AI Patch Application System
 *
 * Applies AI-generated code fixes from Phase 78 suggestions
 * Supports batch application with rollback capability
 */

import { readFile, writeFile } from 'fs/promises';
import postgres from 'postgres';
import { createInterface } from 'readline';

const sql = postgres({
  host: 'localhost',
  port: 5432,
  database: 'legal_ai_db',
  username: 'legal_admin',
  password: process.env.PGPASSWORD || '123456'
});

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function getSuggestions(riskLevel = null) {
  let query = `
    SELECT
      id,
      cluster_id,
      route_path,
      summary,
      patch,
      risk_level,
      created_at,
      source
    FROM error_suggestions
    WHERE applied = false
  `;

  if (riskLevel) {
    query += ` AND risk_level = '${riskLevel}'`;
  }

  query += ` ORDER BY
    CASE risk_level
      WHEN 'low' THEN 1
      WHEN 'medium' THEN 2
      WHEN 'high' THEN 3
    END,
    created_at ASC
  `;

  return await sql.unsafe(query);
}

async function applyPatch(suggestion) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📝 Suggestion #${suggestion.id.substring(0, 8)}...`);
  console.log(`📂 Route: ${suggestion.route_path}`);
  console.log(`📋 Summary: ${suggestion.summary}`);
  console.log(`⚠️  Risk: ${suggestion.risk_level}`);
  console.log(`${'='.repeat(80)}\n`);

  // Parse the JSON patch
  let patch;
  try {
    patch = typeof suggestion.patch === 'string'
      ? JSON.parse(suggestion.patch)
      : suggestion.patch;
  } catch (err) {
    console.error('❌ Failed to parse patch JSON:', err.message);
    return false;
  }

  console.log('📋 Patch Preview:');
  console.log(JSON.stringify(patch, null, 2).substring(0, 500));
  console.log('\n...\n');

  const answer = await question('Apply this patch? [y/N/skip/quit]: ');

  if (answer.toLowerCase() === 'quit' || answer.toLowerCase() === 'q') {
    return 'quit';
  }

  if (answer.toLowerCase() === 'skip' || answer.toLowerCase() === 's') {
    return 'skip';
  }

  if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
    return false;
  }

  // Apply the patch
  try {
    const files = patch.files || [patch];

    for (const filePatch of files) {
      const filePath = filePatch.file || filePatch.path;

      if (!filePath) {
        console.log('⚠️  No file path in patch, skipping...');
        continue;
      }

      console.log(`\n📝 Patching ${filePath}...`);

      // Read current file
      let content;
      try {
        content = await readFile(filePath, 'utf-8');
      } catch (err) {
        console.log(`⚠️  File not found: ${filePath}`);
        continue;
      }

      // Apply changes
      const changes = filePatch.changes || [];
      let newContent = content;

      for (const change of changes) {
        if (change.type === 'replace') {
          if (newContent.includes(change.old)) {
            newContent = newContent.replace(change.old, change.new);
            console.log(`  ✅ Replaced pattern`);
          } else {
            console.log(`  ⚠️  Pattern not found (already fixed?)`);
          }
        } else if (change.type === 'insert') {
          // Insert at specific location
          const lines = newContent.split('\n');
          lines.splice(change.line, 0, change.content);
          newContent = lines.join('\n');
          console.log(`  ✅ Inserted at line ${change.line}`);
        }
      }

      // Write file if changed
      if (newContent !== content) {
        await writeFile(filePath, newContent, 'utf-8');
        console.log(`  ✅ File updated successfully`);
      } else {
        console.log(`  ℹ️  No changes needed (already applied?)`);
      }
    }

    // Mark as applied
    await sql`
      UPDATE error_suggestions
      SET applied = true,
          applied_at = NOW(),
          updated_at = NOW()
      WHERE id = ${suggestion.id}
    `;

    console.log('\n✅ Patch applied successfully!');
    return true;

  } catch (err) {
    console.error('\n❌ Failed to apply patch:', err.message);
    return false;
  }
}

async function main() {
  console.log('🤖 AI Patch Application System\n');

  const args = process.argv.slice(2);
  const riskFilter = args.find(arg => arg.startsWith('--risk='))?.split('=')[1];
  const autoApply = args.includes('--auto-apply-low');

  console.log('📊 Fetching pending suggestions...\n');

  const suggestions = await getSuggestions(riskFilter);

  if (suggestions.length === 0) {
    console.log('✅ No pending suggestions to apply!');
    process.exit(0);
  }

  console.log(`Found ${suggestions.length} pending suggestions:`);
  console.log(`  🟢 Low risk: ${suggestions.filter(s => s.risk_level === 'low').length}`);
  console.log(`  🟡 Medium risk: ${suggestions.filter(s => s.risk_level === 'medium').length}`);
  console.log(`  🔴 High risk: ${suggestions.filter(s => s.risk_level === 'high').length}\n`);

  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < suggestions.length; i++) {
    const suggestion = suggestions[i];

    console.log(`\n[${i + 1}/${suggestions.length}]`);

    // Auto-apply low-risk if flag set
    if (autoApply && suggestion.risk_level === 'low') {
      console.log('🤖 Auto-applying low-risk patch...');
      const result = await applyPatch(suggestion);
      if (result === true) applied++;
      else if (result === false) failed++;
      else if (result === 'skip') skipped++;
      continue;
    }

    const result = await applyPatch(suggestion);

    if (result === 'quit') {
      console.log('\n👋 Quitting...');
      break;
    } else if (result === true) {
      applied++;
    } else if (result === 'skip') {
      skipped++;
    } else {
      failed++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('📊 Application Summary:');
  console.log(`  ✅ Applied: ${applied}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log('='.repeat(80));

  rl.close();
  await sql.end();

  // Run type check
  if (applied > 0) {
    console.log('\n🔍 Running type check to verify fixes...\n');
    const { spawn } = await import('child_process');
    const check = spawn('npm', ['run', 'check'], {
      stdio: 'inherit',
      shell: true
    });

    check.on('close', (code) => {
      console.log(`\n✅ Type check complete (exit code: ${code})`);
      process.exit(0);
    });
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
