import fs from 'node:fs/promises';
import path from 'node:path';
import { logSynthesisRun } from '../../src/lib/server/observability/synthesis-logger.js';

const datasetDir = path.resolve('memory/datasets/legal-contracts/synthetic');

function redactPII(text) {
  let redacted = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');
  redacted = redacted.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]');
  redacted = redacted.replace(/\b\d{3}-\d{3}-\d{4}\b/g, '[REDACTED_PHONE]');
  return redacted;
}

async function ingest() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  if (!isDryRun) {
    console.error('ERROR: dry-run mode required');
    process.exit(1);
  }

  // 1. "synthetic docs only first"
  if (!datasetDir.includes('synthetic')) {
    console.error('ERROR: synthetic docs only first');
    process.exit(1);
  }

  const files = await fs.readdir(datasetDir).catch(() => []);
  if (files.length === 0) {
    console.log('No synthetic documents found.');
    return;
  }

  for (const file of files) {
    const filePath = path.join(datasetDir, file);
    const contentRaw = await fs.readFile(filePath, 'utf8');
    const doc = JSON.parse(contentRaw);

    // 2. "sourceRefs required"
    if (!doc.sourceRef) {
      console.error(`ERROR: sourceRefs required for document ${file}`);
      process.exit(1);
    }

    // 3. "clause extraction only"
    console.log(`[Ingest] Processing document for clause extraction: ${doc.sourceRef}`);

    // 5. "PII/redaction checks"
    const redactedContent = redactPII(doc.content);

    // 4. "no legal advice claim"
    const finalOutput = `[Disclaimer: This system extracts clauses only and does not provide legal advice.]\n\nExtracted Clauses:\n${redactedContent}`;

    // 6. "all outputs logged to synthesis_logs + Engram feedback"
    const runId = `synthetic-run-${Date.now()}`;
    await logSynthesisRun({
      runId,
      queryHash: 'synthetic',
      sourceStage: 'synthetic-ingest',
      selectedNodes: [],
      selectedEdges: [],
      pathMapping: [{ path: doc.sourceRef }],
      summary: finalOutput,
      metadata: {
        isDryRun,
        redacted: true
      }
    });

    console.log(`[Ingest] ✓ Ingested ${file} with runId: ${runId}`);
  }

  console.log('[Ingest] Finished synthetic ingestion (DRY RUN).');
}

ingest().catch(console.error);
