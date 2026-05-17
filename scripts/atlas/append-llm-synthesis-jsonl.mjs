import fs from 'fs';
import path from 'path';

/**
 * Append LLM Synthesis record to a JSONL dataset file.
 * Automatically enforces strict memory hygiene constraints.
 */
export function appendLlmSynthesisJsonl(record) {
  if (!record || typeof record !== 'object') {
    throw new Error('Record must be a non-null object');
  }

  // Validate security / memory hygiene
  const str = JSON.stringify(record);
  if (
    str.includes('"hiddenThoughts"') ||
    str.includes('"chainOfThought"') ||
    str.includes('"kv_cache"') ||
    str.includes('"tensor"') ||
    str.includes('"cudaPointer"')
  ) {
    throw new Error(
      'Security Constraint Violation: Persistent synthesis JSONL dataset cannot store raw tensor, cudaPointer, hiddenThoughts or chainOfThought.'
    );
  }

  // Ensure dataset directory exists
  const datasetDir = path.resolve('memory/datasets/llm_synthesis');
  if (!fs.existsSync(datasetDir)) {
    fs.mkdirSync(datasetDir, { recursive: true });
  }

  // File name format: YYYY-MM-DD.jsonl
  const today = new Date().toISOString().split('T')[0];
  const filePath = path.join(datasetDir, `${today}.jsonl`);

  // Prepare line
  const line = JSON.stringify({
    ...record,
    datasetTimestamp: new Date().toISOString(),
  }) + '\n';

  // Append line
  fs.appendFileSync(filePath, line, 'utf8');
  return filePath;
}

// CLI Execution Support
if (process.argv[1] && (process.argv[1].endsWith('append-llm-synthesis-jsonl.mjs') || process.argv[1].endsWith('append-llm-synthesis-jsonl.js'))) {
  try {
    const rawData = process.argv[2];
    if (!rawData) {
      console.error('Error: No record payload provided. Usage: node append-llm-synthesis-jsonl.mjs \'<json_payload>\'');
      process.exit(1);
    }
    const parsed = JSON.parse(rawData);
    const savedPath = appendLlmSynthesisJsonl(parsed);
    console.log(`Successfully appended record to ${savedPath}`);
  } catch (err) {
    console.error('Failed to append JSONL record:', err.message);
    process.exit(1);
  }
}
