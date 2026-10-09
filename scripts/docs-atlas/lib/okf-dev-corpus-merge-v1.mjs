export function mergeOkfDevCorpusRowsV1(existingRows, additions) {
  const merged = [...existingRows];
  const sourceRefs = new Map();
  const urls = new Map();

  for (const row of existingRows) {
    if (!row.source_ref || !row.url || sourceRefs.has(row.source_ref) || urls.has(row.url)) {
      throw new Error('EXISTING_CORPUS_IDENTITY_INVALID_OR_DUPLICATED');
    }
    sourceRefs.set(row.source_ref, row);
    urls.set(row.url, row);
  }

  for (const row of additions) {
    if (!row.source_ref || !row.url) throw new Error('ADDITION_CORPUS_IDENTITY_MISSING');
    const existingByRef = sourceRefs.get(row.source_ref);
    if (existingByRef) {
      if (existingByRef.url === row.url && existingByRef.content_hash === row.content_hash) continue;
      throw new Error('CORPUS_SOURCE_REF_CONFLICT');
    }
    if (urls.has(row.url)) throw new Error('CORPUS_URL_CONFLICT');
    sourceRefs.set(row.source_ref, row);
    urls.set(row.url, row);
    merged.push(row);
  }

  return merged;
}

export function summarizeOkfDevCorpusRowsV1(rows) {
  const summary = {};
  for (const row of rows) {
    const source = summary[row.source_id] ??= { pages: 0, domains: {} };
    source.pages += 1;
    source.domains[row.domain_class] = (source.domains[row.domain_class] ?? 0) + 1;
  }
  return summary;
}
