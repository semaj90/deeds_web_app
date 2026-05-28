#!/usr/bin/env node
import { promptRetrieve } from '../../src/lib/server/retrieval/prompt-listener.ts';
import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), '.tmp', 'atlas-retrieval-loop.jsonl');

async function test() {
  console.log('=== Running Prompt Listener Smoke Test ===');
  
  if (fs.existsSync(LOG_FILE)) {
    fs.unlinkSync(LOG_FILE);
  }

  const { acePacket, trace } = await promptRetrieve('Find CUDA schema tables and Qdrant cluster tags');
  
  console.log('Generated ACE Packet:', acePacket);
  console.log('Trace details:', JSON.stringify(trace, null, 2));

  if (!fs.existsSync(LOG_FILE)) {
    throw new Error('❌ Log file not written!');
  }
  
  const logContent = fs.readFileSync(LOG_FILE, 'utf8').trim();
  console.log('Log entry recorded:', logContent);

  console.log('✅ Prompt Listener Smoke Test Passed Successfully!');
}

test().catch(err => {
  console.error('❌ Test Failed:', err);
  process.exit(1);
});
