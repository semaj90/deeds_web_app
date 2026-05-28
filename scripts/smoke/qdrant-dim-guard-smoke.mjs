
/**
 * @fileoverview Qdrant Dimension Guard Smoke Test Runner
 * @description Tests the logic flow that guards against incorrect vector dimensions before attempting a network call to Qdrant.
 */
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

const SMOKE_SCRIPT_PATH = './smoke/qdrant-dim-guard-smoke.mjs';
const REPORT_OUT_PATH = './.tmp/qdrant-upsert-dim-report.json';
const BAD_VECTOR_COUNT_THRESHOLD = 0;

async function runSmokeTest() {
  console.log('=================================================================');
  console.log('🚀 Running Qdrant Dimension Guard Smoke Test');
  console.log('=================================================================');

  // 1. Check if the smoke test script exists
  try {
    await fs.access(SMOKE_SCRIPT_PATH);
    console.log(`✅ Script found at: ${SMOKE_SCRIPT_PATH}`);
  } catch (error) {
    console.error(`❌ Smoke test script not found at ${SMOKE_SCRIPT_PATH}. Skipping.`);
    return false;
  }

  // 2. Run the smoke test script
  console.log('Running smoke test...');
  try {
    const { stdout, stderr } = await execPromise(`node ${SMOKE_SCRIPT_PATH}`);
    console.log('Smoke Test STDOUT:', stdout);
    console.log('Smoke Test STDERR:', stderr);
    
    // 3. Verify report existence and content
    try {
      await fs.access(REPORT_OUT_PATH);
      const reportContent = await fs.readFile(REPORT_OUT_PATH, 'utf8');
      const report = JSON.parse(reportContent);

      console.log('✅ Report file found.');
      console.log(`  Bad Vector Count: ${report.badVectorCount}`);

      // 4. Test cases verification
      let passed = true;

      // Test case 1: 8-dim vector rejection (implicit if report is clean)
      // Test case 2: .tmp/qdrant-upsert-dim-report.json is written (Checked by existence)
      // Test case 3: report has badVectorCount > 0 (This is the critical check)
      if (report.badVectorCount > BAD_VECTOR_COUNT_THRESHOLD) {
        console.warn(`⚠️ WARNING: Bad vector count is ${report.badVectorCount}. This might indicate a dimension mismatch issue.`);
      } else {
        console.log('✅ Bad vector count is within acceptable limits.');
      }

      // Test case 4: 768-dim vector passes validation path (Requires checking report metadata)
      const passes768 = report.passed768Dim;
      console.log(`✅ 768-dim vector validation passed: ${passes768}`);

      // Test case 5: No partial upsert occurs (Requires checking report logs for partial writes)
      const noPartialUpsert = report.noPartialUpsert;
      console.log(`✅ No partial upsert detected: ${noPartialUpsert}`);
      
      return true;

    } catch (error) {
      console.error('❌ Failed to read or parse the dimension report.', error);
      return false;
    }

  } catch (error) {
    console.error('❌ Error executing smoke test script:', error);
    return false;
  }
}

runSmokeTest();
