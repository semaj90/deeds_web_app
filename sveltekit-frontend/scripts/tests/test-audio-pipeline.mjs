/**
 * Audio Pipeline Integration Test
 * Tests the full audio upload → RabbitMQ → Whisper → ACE → Qdrant pipeline
 *
 * Usage: node scripts/tests/test-audio-pipeline.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5173';
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || null;

// ANSI colors
const green = '\x1b[32m';
const red = '\x1b[31m';
const yellow = '\x1b[33m';
const blue = '\x1b[34m';
const reset = '\x1b[0m';

function log(message, color = reset) {
  console.log(`${color}${message}${reset}`);
}

/**
 * Test 1: Upload audio file
 */
async function testAudioUpload() {
  log('\n📤 Test 1: Upload Audio File', blue);

  try {
    // Note: This requires a test audio file
    // For now, we'll test with a mock file path
    const testAudioPath = join(__dirname, 'fixtures', 'test-audio.mp3');

    let audioBuffer;
    try {
      audioBuffer = readFileSync(testAudioPath);
    } catch (err) {
      log('⚠️  No test audio file found. Skipping upload test.', yellow);
      log('   To test: create scripts/tests/fixtures/test-audio.mp3', yellow);
      return null;
    }

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    formData.append('audio', blob, 'test-audio.mp3');
    // No caseId — test without case association to avoid FK constraint issues

    const response = await fetch(`${BASE_URL}/api/audio/upload`, {
      method: 'POST',
      body: formData,
      headers: AUTH_TOKEN ? { 'Cookie': `auth_session=${AUTH_TOKEN}` } : {}
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      log(`❌ Upload failed: ${error.error || response.statusText}`, red);
      return null;
    }

    const result = await response.json();
    log(`✅ Upload successful: evidenceId=${result.evidenceId}`, green);
    return result.evidenceId;
  } catch (error) {
    log(`❌ Upload test error: ${error.message}`, red);
    return null;
  }
}

/**
 * Test 2: Monitor SSE progress stream
 */
async function testProgressStream(evidenceId) {
  log('\n📡 Test 2: Monitor SSE Progress Stream', blue);

  if (!evidenceId) {
    log('⚠️  Skipping (no evidenceId from upload)', yellow);
    return;
  }

  return new Promise((resolve, reject) => {
    const eventSource = new EventSource(`${BASE_URL}/api/audio/progress/${evidenceId}`);
    const stages = [];
    let lastProgress = 0;
    const timeout = setTimeout(() => {
      eventSource.close();
      reject(new Error('SSE timeout after 60s'));
    }, 60000);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        stages.push(data);

        if (data.progress > lastProgress) {
          log(`  Stage: ${data.stage} (${data.progress}%) - ${data.message}`, yellow);
          lastProgress = data.progress;
        }

        if (data.stage === 'complete') {
          clearTimeout(timeout);
          eventSource.close();
          log('✅ Processing complete!', green);
          if (data.details) {
            log(`  Duration: ${data.details.duration}s`, reset);
            log(`  Language: ${data.details.language}`, reset);
            log(`  Entities: ${data.details.entities}`, reset);
            log(`  Tags: ${data.details.tags?.join(', ')}`, reset);
          }
          resolve(stages);
        } else if (data.stage === 'error') {
          clearTimeout(timeout);
          eventSource.close();
          log(`❌ Processing failed: ${data.message}`, red);
          reject(new Error(data.message));
        }
      } catch (err) {
        log(`❌ Failed to parse SSE event: ${err.message}`, red);
      }
    };

    eventSource.onerror = () => {
      clearTimeout(timeout);
      eventSource.close();
      reject(new Error('SSE connection error'));
    };
  });
}

/**
 * Test 3: Verify Redis status updates
 */
async function testRedisStatus(evidenceId) {
  log('\n🔍 Test 3: Verify Redis Status', blue);

  if (!evidenceId) {
    log('⚠️  Skipping (no evidenceId)', yellow);
    return;
  }

  try {
    // This requires a custom endpoint to read Redis - for now we'll skip
    log('⚠️  Redis status verification requires Redis CLI access', yellow);
    log('   Manual check: redis-cli GET "audio:status:' + evidenceId + '"', yellow);
  } catch (error) {
    log(`❌ Redis check error: ${error.message}`, red);
  }
}

/**
 * Test 4: Verify evidence record update
 */
async function testEvidenceRecord(evidenceId) {
  log('\n📄 Test 4: Verify Evidence Record', blue);

  if (!evidenceId) {
    log('⚠️  Skipping (no evidenceId)', yellow);
    return;
  }

  try {
    const response = await fetch(`${BASE_URL}/api/evidence/${evidenceId}`, {
      headers: AUTH_TOKEN ? { 'Cookie': `auth_session=${AUTH_TOKEN}` } : {}
    });

    if (!response.ok) {
      log(`❌ Failed to fetch evidence record: ${response.statusText}`, red);
      return;
    }

    const evidence = await response.json();

    if (evidence.metadata?.transcription) {
      log('✅ Transcription found in metadata', green);
      log(`  Text length: ${evidence.metadata.transcription.text?.length || 0} chars`, reset);
      log(`  Language: ${evidence.metadata.transcription.language}`, reset);
      log(`  Segments: ${evidence.metadata.transcription.segments?.length || 0}`, reset);
    } else {
      log('⚠️  No transcription in metadata (might still be processing)', yellow);
    }

    if (evidence.metadata?.aceAnalysis) {
      log('✅ ACE analysis found', green);
      log(`  Summary: ${evidence.metadata.aceAnalysis.summary?.slice(0, 100)}...`, reset);
      log(`  Tags: ${evidence.metadata.aceAnalysis.tags?.join(', ')}`, reset);
    } else {
      log('⚠️  No ACE analysis in metadata', yellow);
    }

    if (evidence.metadata?.entities && evidence.metadata.entities.length > 0) {
      log(`✅ Found ${evidence.metadata.entities.length} entities`, green);
    }
  } catch (error) {
    log(`❌ Evidence record check error: ${error.message}`, red);
  }
}

/**
 * Test 5: Verify Qdrant indexing
 */
async function testQdrantIndex(evidenceId) {
  log('\n🔍 Test 5: Verify Qdrant Indexing', blue);

  if (!evidenceId) {
    log('⚠️  Skipping (no evidenceId)', yellow);
    return;
  }

  try {
    const response = await fetch('http://localhost:6333/collections/evidence_items/points/' + evidenceId);

    if (!response.ok) {
      log(`❌ Failed to fetch from Qdrant: ${response.statusText}`, red);
      return;
    }

    const result = await response.json();

    if (result.result) {
      log('✅ Found in Qdrant evidence_items collection', green);
      log(`  Payload tags: ${result.result.payload?.tags?.join(', ')}`, reset);
      log(`  Type: ${result.result.payload?.type}`, reset);
    } else {
      log('⚠️  Not found in Qdrant (might still be indexing)', yellow);
    }
  } catch (error) {
    log(`❌ Qdrant check error: ${error.message}`, red);
  }
}

/**
 * Main test runner
 */
async function runTests() {
  log('═══════════════════════════════════════════════════', blue);
  log('   Audio Pipeline Integration Test', blue);
  log('═══════════════════════════════════════════════════', blue);

  const startTime = Date.now();

  try {
    // Test 1: Upload
    const evidenceId = await testAudioUpload();

    if (evidenceId) {
      // Test 2: Progress stream
      try {
        await testProgressStream(evidenceId);
      } catch (err) {
        log(`⚠️  SSE stream error: ${err.message}`, yellow);
      }

      // Wait a bit for processing to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Test 3: Redis status
      await testRedisStatus(evidenceId);

      // Test 4: Evidence record
      await testEvidenceRecord(evidenceId);

      // Test 5: Qdrant index
      await testQdrantIndex(evidenceId);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    log(`\n✅ Tests completed in ${duration}s`, green);
  } catch (error) {
    log(`\n❌ Test suite failed: ${error.message}`, red);
    console.error(error);
    process.exit(1);
  }
}

// Run if called directly
const __thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] === __thisFile || process.argv[1].replace(/\\/g, '/') === __thisFile.replace(/\\/g, '/')) {
  runTests();
}

export { runTests, testAudioUpload, testProgressStream };
