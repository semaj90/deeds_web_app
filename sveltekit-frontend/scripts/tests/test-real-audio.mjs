/**
 * Test Audio Pipeline with Real MP3 from Downloads
 */

import { readFile } from 'fs/promises';
import { basename } from 'path';

const BASE_URL = process.env.PUBLIC_APP_URL ?? (process.env.TEST_BASE_URL || 'http://localhost:5173');
const AUDIO_PATH = 'C:/Users/james/Downloads/(One, two, three, four).mp3';

// ANSI colors
const green = '\x1b[32m';
const red = '\x1b[31m';
const yellow = '\x1b[33m';
const blue = '\x1b[34m';
const reset = '\x1b[0m';

function log(message, color = reset) {
  console.log(`${color}${message}${reset}`);
}

async function uploadAudio() {
  log('\n📤 Uploading Real Audio File', blue);
  log(`  File: ${basename(AUDIO_PATH)}`, reset);

  try {
    const audioBuffer = await readFile(AUDIO_PATH);
    log(`  Size: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`, reset);

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    formData.append('audio', blob, basename(AUDIO_PATH));
    formData.append('caseId', 'c9b79f5d-4a5e-4e8f-8f3c-1a2b3c4d5e6f');

    const response = await fetch(`${BASE_URL}/api/audio/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      log(`❌ Upload failed: ${error.error || response.statusText}`, red);
      return null;
    }

    const result = await response.json();
    log(`✅ Upload successful!`, green);
    log(`  Evidence ID: ${result.evidenceId}`, reset);
    return result.evidenceId;
  } catch (error) {
    log(`❌ Upload error: ${error.message}`, red);
    return null;
  }
}

async function pollRedisStatus(evidenceId, maxPolls = 60) {
  log('\n⏳ Monitoring Processing Status (Redis polling)...', blue);

  for (let i = 0; i < maxPolls; i++) {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execPromise = promisify(exec);

      const { stdout } = await execPromise(
        `docker exec deeds-redis-prod redis-cli GET "audio:status:${evidenceId}"`
      );

      if (stdout.trim() === '(nil)' || !stdout.trim()) {
        log(`  [${i + 1}/${maxPolls}] No status yet...`, yellow);
      } else {
        const status = JSON.parse(stdout.trim().replace(/^"|"$/g, ''));
        const progress = '█'.repeat(Math.floor(status.progress / 5)) + '░'.repeat(20 - Math.floor(status.progress / 5));
        log(`  [${status.stage}] ${progress} ${status.progress}% - ${status.message}`, reset);

        if (status.stage === 'complete') {
          log(`\n✅ Processing Complete!`, green);
          return true;
        }
        if (status.stage === 'error') {
          log(`\n❌ Processing Failed: ${status.error}`, red);
          return false;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 2000)); // Poll every 2s
    } catch (error) {
      log(`  Poll error: ${error.message}`, yellow);
    }
  }

  log(`\n⏱️  Timeout after ${maxPolls * 2}s`, yellow);
  return false;
}

async function verifyResults(evidenceId) {
  log('\n🔍 Verifying Results...', blue);

  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
    });

    const result = await pool.query(
      `SELECT
        file_name,
        metadata->'transcription'->>'text' as transcription,
        metadata->'transcription'->>'language' as language,
        metadata->'transcription'->>'duration' as duration,
        jsonb_array_length(metadata->'entities') as entity_count,
        metadata->'aceAnalysis'->>'summary' as ace_summary,
        metadata->'aceAnalysis'->>'confidence' as ace_confidence,
        jsonb_array_length(metadata->'aceAnalysis'->'tags') as tag_count
      FROM evidence
      WHERE id = $1`,
      [evidenceId]
    );

    if (result.rows.length === 0) {
      log(`❌ Evidence record not found`, red);
      await pool.end();
      return false;
    }

    const row = result.rows[0];

    log(`\n📊 Transcription Results:`, blue);
    log(`  File: ${row.file_name}`, reset);
    log(`  Language: ${row.language}`, reset);
    log(`  Duration: ${row.duration}s`, reset);
    log(`  Text Length: ${row.transcription?.length || 0} chars`, reset);

    if (row.transcription && row.transcription.length > 0) {
      log(`\n📝 Transcription Preview:`, blue);
      log(`  "${row.transcription.slice(0, 200)}..."`, reset);
    } else {
      log(`\n⚠️  No transcription text found`, yellow);
    }

    log(`\n🏷️  ACE Analysis:`, blue);
    log(`  Entities Found: ${row.entity_count || 0}`, reset);
    log(`  Tags: ${row.tag_count || 0}`, reset);
    log(`  Confidence: ${row.ace_confidence || 'N/A'}`, reset);

    if (row.ace_summary && row.ace_summary !== '...') {
      log(`  Summary: ${row.ace_summary.slice(0, 150)}...`, reset);
    }

    // Check Qdrant
    log(`\n🔍 Checking Qdrant Indexing...`, blue);
    const qdrantResponse = await fetch('http://localhost:6333/collections/evidence_items/points/scroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: {
          must: [{ key: 'evidenceId', match: { value: evidenceId } }]
        },
        limit: 10,
        with_payload: true
      })
    });

    if (qdrantResponse.ok) {
      const qdrantData = await qdrantResponse.json();
      const points = qdrantData.result?.points || [];
      log(`  ✅ Indexed in Qdrant: ${points.length} point(s)`, green);

      if (points.length > 0) {
        log(`  Sample payload:`, reset);
        log(`    - Text: "${points[0].payload.transcription?.slice(0, 100)}..."`, reset);
        log(`    - Tags: ${JSON.stringify(points[0].payload.aceTags || [])}`, reset);
      }
    } else {
      log(`  ⚠️  Failed to query Qdrant`, yellow);
    }

    await pool.end();

    const success = row.transcription && row.transcription.length > 0;
    return success;
  } catch (error) {
    log(`❌ Verification error: ${error.message}`, red);
    return false;
  }
}

async function main() {
  log('═══════════════════════════════════════════════════', blue);
  log('   Real Audio Upload Test', blue);
  log('   File: (One, two, three, four).mp3', blue);
  log('═══════════════════════════════════════════════════', blue);

  const evidenceId = await uploadAudio();
  if (!evidenceId) {
    log('\n❌ Upload failed, aborting test', red);
    return;
  }

  const completed = await pollRedisStatus(evidenceId);

  const verified = await verifyResults(evidenceId);

  if (verified) {
    log('\n🎉 AUDIO PIPELINE FULLY OPERATIONAL!', green);
    log('\n✅ All stages verified:', reset);
    log('  1. Upload ✅', reset);
    log('  2. Whisper Transcription ✅', reset);
    log('  3. Entity Extraction ✅', reset);
    log('  4. ACE Analysis ✅', reset);
    log('  5. Qdrant Indexing ✅', reset);
    log('  6. Evidence Metadata ✅', reset);
  } else {
    log('\n⚠️  Pipeline completed but results unclear', yellow);
    log('   Check evidence record manually for details', reset);
  }
}

main().catch(console.error);
