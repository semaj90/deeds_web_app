#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export function buildChunkCorpusJsonl(envelopes) {
  if (!Array.isArray(envelopes)) throw new Error('ENVELOPES_MUST_BE_ARRAY');
  const rows = [];
  const seen = new Set();

  for (const envelope of envelopes) {
    const page = envelope?.page;
    if (!page || typeof envelope.sourceId !== 'string' || !Array.isArray(envelope.chunks)) {
      throw new Error('ENVELOPE_SHAPE_INVALID');
    }
    for (const chunk of envelope.chunks) {
      const text = chunk?.text;
      const byteStart = chunk?.startByte;
      const byteEnd = chunk?.endByte;
      if (typeof text !== 'string' || !text.length) throw new Error('CHUNK_TEXT_MISSING');
      if (!Number.isSafeInteger(byteStart) || !Number.isSafeInteger(byteEnd) || byteStart < 0 || byteEnd < byteStart) {
        throw new Error('CHUNK_BYTE_SPAN_INVALID');
      }
      if (byteEnd - byteStart !== Buffer.byteLength(text, 'utf8')) throw new Error('CHUNK_BYTE_SPAN_LENGTH_MISMATCH');
      if (typeof chunk.chunkId !== 'string' || !chunk.chunkId) throw new Error('CHUNK_ID_MISSING');
      if (seen.has(chunk.chunkId)) throw new Error(`DUPLICATE_CHUNK_ID:${chunk.chunkId}`);
      seen.add(chunk.chunkId);
      const textChecksum = sha256(text);
      if (chunk.chunkChecksum !== textChecksum) throw new Error(`CHUNK_CHECKSUM_MISMATCH:${chunk.chunkId}`);
      if (typeof chunk.evidenceRevision !== 'string' || !chunk.evidenceRevision) throw new Error(`CHUNK_EVIDENCE_REVISION_MISSING:${chunk.chunkId}`);
      if (typeof page.evidenceRevision !== 'string' || !page.evidenceRevision) throw new Error(`PAGE_EVIDENCE_REVISION_MISSING:${envelope.sourceId}`);
      if (typeof page.url !== 'string' || !page.url) throw new Error(`CANONICAL_URL_MISSING:${envelope.sourceId}`);
      if (!Number.isSafeInteger(chunk.ordinal) || chunk.ordinal < 0) throw new Error(`CHUNK_ORDINAL_INVALID:${chunk.chunkId}`);

      rows.push({
        schema: 'atlas.external-doc-chunk-corpus.v1',
        canonicalAuthority: false,
        manifestRevision: envelope.manifestRevision ?? null,
        sourceId: envelope.sourceId,
        sourceRevision: envelope.sourceRevision ?? null,
        provider: page.provider ?? null,
        product: page.product ?? null,
        productVersion: page.productVersion ?? null,
        canonicalUrl: page.url,
        documentChecksum: page.contentHash ?? null,
        documentEvidenceRevision: page.evidenceRevision,
        acquisitionRevision: page.crawlRevision ?? null,
        parserRevision: page.parserRevision ?? null,
        chunkId: chunk.chunkId,
        chunkEvidenceRevision: chunk.evidenceRevision,
        chunkChecksum: textChecksum,
        ordinal: chunk.ordinal,
        startByte: byteStart,
        endByte: byteEnd,
        startChar: chunk.startChar ?? null,
        endChar: chunk.endChar ?? null,
        coordinateValidation: 'BYTE_LENGTH_ONLY_SOURCE_SLICE_NOT_RECHECKED',
        headingPath: chunk.headingPath ?? [],
        sectionAnchor: chunk.sectionAnchor ?? null,
        text
      });
    }
  }

  rows.sort((a, b) => compareText(a.sourceId, b.sourceId)
    || compareText(a.canonicalUrl, b.canonicalUrl)
    || Number(a.ordinal ?? 0) - Number(b.ordinal ?? 0)
    || compareText(a.chunkId, b.chunkId));
  const jsonl = rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
  return {
    jsonl,
    receipt: {
      schema: 'atlas.external-doc-chunk-corpus-export-receipt.v1',
      status: 'LOCAL_DIAGNOSTIC_CORPUS_READY',
      rowCount: rows.length,
      sourceCount: new Set(rows.map((row) => row.sourceId)).size,
      outputChecksum: sha256(jsonl),
      canonicalAuthority: false,
      embeddingPerformed: false,
      datastoreWrites: 0
    }
  };
}

async function main(argv) {
  const inputAt = argv.indexOf('--input');
  const outputAt = argv.indexOf('--output');
  if (inputAt < 0 || outputAt < 0 || !argv[inputAt + 1] || !argv[outputAt + 1]) {
    throw new Error('USAGE: --input <envelopes.json> --output <chunks.jsonl>');
  }
  const inputPath = resolve(argv[inputAt + 1]);
  const outputPath = resolve(argv[outputAt + 1]);
  const envelopes = JSON.parse(await readFile(inputPath, 'utf8'));
  const result = buildChunkCorpusJsonl(envelopes);
  await writeFile(outputPath, result.jsonl, 'utf8');
  process.stdout.write(`${JSON.stringify({ ...result.receipt, inputPath, outputPath }, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
