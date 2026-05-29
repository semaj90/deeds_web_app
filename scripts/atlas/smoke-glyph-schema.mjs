#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const schemaPath = path.join(root, 'sveltekit-frontend', 'src', 'lib', 'server', 'db', 'schema-postgres.ts');
const manualDir = path.join(root, 'sveltekit-frontend', 'drizzle', 'manual');

function fileExists(p){ try { return fs.existsSync(p); } catch(e){ return false } }

let ok = true;
console.log('Smoke: glyph schema checks');

// 1. schema exports
if (!fileExists(schemaPath)){
  console.error('FAIL: schema-postgres.ts not found:', schemaPath);
  ok = false;
} else {
  const src = fs.readFileSync(schemaPath,'utf8');
  const hasGlyph = /glyphRecords|glyph_records/.test(src);
  const hasLora = /loraTrainingRuns|lora_training_runs/.test(src);
  console.log(' - schema file found');
  console.log('   - glyphRecords export:', hasGlyph ? 'yes' : 'NO');
  console.log('   - loraTrainingRuns export:', hasLora ? 'yes' : 'NO');
  if(!hasGlyph || !hasLora) ok = false;
}

// 2. manual SQL files
const expected = [
  '20260416_glyph_records.sql',
  '20260529_glyph_records.sql',
  '20260529_lora_training_runs.sql'
];
for(const f of expected){
  const p = path.join(manualDir,f);
  if(!fileExists(p)){
    console.error('FAIL: missing manual SQL:', f);
    ok = false;
    continue;
  }
  const t = fs.readFileSync(p,'utf8');
  const hasCreate = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i.test(t);
  console.log(` - ${f}: found`);
  console.log('   - CREATE IF NOT EXISTS:', hasCreate? 'yes':'NO');

  // Different expectations for glyph vs lora files
  if (/lora/i.test(f)) {
    const hasRunId = /run_id/i.test(t);
    const hasModelId = /model_id/i.test(t);
    const hasCheckpoint = /checkpoint_uri|checkpoint/i.test(t);
    const hasStatus = /status/i.test(t);
    console.log('   - run_id present:', hasRunId? 'yes':'NO');
    console.log('   - model_id present:', hasModelId? 'yes':'NO');
    console.log('   - checkpoint_uri present:', hasCheckpoint? 'yes':'NO');
    console.log('   - status present:', hasStatus? 'yes':'NO');
    if(!hasCreate || !hasRunId || !hasModelId || !hasCheckpoint) ok = false;
  } else {
    // glyph files: accept several naming variants (source_ref, source_id, glyph_id, glyph_kind, card_id)
    const hasSourceRefIdx = /source_ref|source_id|card_id|glyph_kind|glyph_id/i.test(t);
    console.log('   - source_ref/card_id/glyph_id present:', hasSourceRefIdx? 'yes':'NO');
    if(!hasCreate || !hasSourceRefIdx) ok = false;
  }
}

if(!ok){
  console.error('\nSmoke checks failed');
  process.exit(2);
}

console.log('\nAll smoke checks passed');
process.exit(0);
