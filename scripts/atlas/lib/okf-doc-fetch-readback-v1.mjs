import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function verifyOkfDocFetchReadbackV1({ corpusPath, outputRoot, fileSystem = fs }) {
  const resolvedCorpusPath = path.resolve(corpusPath);
  const resolvedOutputRoot = path.resolve(outputRoot);
  const corpusBytes = fileSystem.readFileSync(resolvedCorpusPath);
  const corpusText = corpusBytes.toString('utf8');
  const lines = corpusText.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) throw new Error('OKF_CORPUS_EMPTY');

  const records = lines.map((line, index) => {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      throw new Error(`OKF_CORPUS_INVALID_JSON_LINE:${index + 1}`);
    }
    if (record.schema_version !== 'okf.dev.corpus.v1'
      || typeof record.source_id !== 'string' || !record.source_id
      || typeof record.source_ref !== 'string' || !record.source_ref
      || typeof record.url !== 'string'
      || typeof record.content_hash !== 'string' || !/^[a-f0-9]{64}$/.test(record.content_hash)
      || typeof record.markdown_path !== 'string' || !record.markdown_path) {
      throw new Error(`OKF_CORPUS_RECORD_INVALID:${index + 1}`);
    }
    const markdownPath = path.resolve(record.markdown_path);
    const relativeMarkdownPath = path.relative(resolvedOutputRoot, markdownPath);
    if (!relativeMarkdownPath || relativeMarkdownPath.startsWith('..') || path.isAbsolute(relativeMarkdownPath)) {
      throw new Error(`OKF_MARKDOWN_PATH_OUTSIDE_OUTPUT_ROOT:${index + 1}`);
    }
    const markdownBytes = fileSystem.readFileSync(markdownPath);
    const markdownChecksum = sha256(markdownBytes);
    if (markdownChecksum !== record.content_hash) throw new Error(`OKF_MARKDOWN_CHECKSUM_MISMATCH:${index + 1}`);
    return {
      sourceId: record.source_id,
      sourceRef: record.source_ref,
      url: record.url,
      title: record.title,
      contentHash: record.content_hash,
      markdownBytes: markdownBytes.length,
      fetchedVia: record.metadata?.fetched_via ?? null,
      status: 'READBACK_MATCH',
    };
  });

  const payload = {
    schema: 'atlas.okf-doc-fetch-readback.v1',
    status: 'SCRATCH_FETCH_READBACK_VERIFIED_NOT_INDEXED',
    corpusPath: resolvedCorpusPath,
    corpusChecksum: sha256(corpusBytes),
    recordCount: records.length,
    records,
    canonicalAuthority: false,
    datastoreWritesPerformed: false,
  };
  return { ...payload, receiptChecksum: sha256(Buffer.from(JSON.stringify(payload), 'utf8')) };
}
