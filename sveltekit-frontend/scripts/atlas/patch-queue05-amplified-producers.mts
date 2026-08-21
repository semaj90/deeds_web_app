#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const target = path.join(ROOT, 'src/lib/server/queue/queue-worker.ts');
let source = await readFile(target, 'utf8');

const beforeVector = `		// Chain to vector.index — uses dispatch utility so inline fallback works
		const { dispatchOrExecuteInline } = await import('./dispatch-inline.js');
		await dispatchOrExecuteInline('vector.index', {
			documentId: data.documentId,
			embedding,
			collection: data.collection ?? 'legal_documents',
			metadata: {
				documentId: data.documentId,
				text: data.text.slice(0, 500)
			}
		});`;

const afterVector = `		// QUEUE-05: materialize the large embedding before crossing RabbitMQ.
		const { toLegacyVectorIndexArtifactMessage } = await import(
			'./legacy-amplified-payload-artifact-v1.js'
		);
		const vectorMessage = await toLegacyVectorIndexArtifactMessage({
			documentId: data.documentId,
			embedding,
			collection: data.collection ?? 'legal_documents',
			metadata: {
				documentId: data.documentId,
				text: data.text.slice(0, 500),
			},
			producerRevision: 'document-embed-worker-artifact-ref-v1',
		});
		const { dispatchOrExecuteInline } = await import('./dispatch-inline.js');
		await dispatchOrExecuteInline('vector.index', vectorMessage);`;

const beforeDocument = `    // Chain to document embedding — uses dispatch utility so inline fallback works
    const { dispatchOrExecuteInline } = await import('./dispatch-inline.js');
    await dispatchOrExecuteInline('document.embed', {
      documentId: data.evidenceId,
      text: processedText,
      collection: 'evidence_items',
      metadata: {
        entities,
        forensics: { flags: forensics },
        contentType: data.contentType,
      },
    });`;

const afterDocument = `    // QUEUE-05: materialize full processed text before crossing RabbitMQ.
    const { toLegacyDocumentEmbedArtifactMessage } = await import(
      './legacy-amplified-payload-artifact-v1.js'
    );
    const documentMessage = await toLegacyDocumentEmbedArtifactMessage({
      documentId: data.evidenceId,
      text: processedText,
      collection: 'evidence_items',
      metadata: {
        entities,
        forensics: { flags: forensics },
        contentType: data.contentType,
      },
      producerRevision: 'evidence-process-worker-artifact-ref-v1',
    });
    const { dispatchOrExecuteInline } = await import('./dispatch-inline.js');
    await dispatchOrExecuteInline('document.embed', documentMessage);`;

const replacements: Array<[string, string, string]> = [
  ['DocumentEmbedWorker → vector.index', beforeVector, afterVector],
  ['EvidenceProcessWorker → document.embed', beforeDocument, afterDocument],
];

for (const [label, before, after] of replacements) {
  if (source.includes(after)) {
    console.log(`[QUEUE-05] already patched: ${label}`);
    continue;
  }
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`[QUEUE-05] expected exactly one ${label} match, found ${occurrences}`);
  }
  source = source.replace(before, after);
  console.log(`[QUEUE-05] patched: ${label}`);
}

await writeFile(target, source, 'utf8');
console.log(`[QUEUE-05] wrote ${path.relative(ROOT, target)}`);
