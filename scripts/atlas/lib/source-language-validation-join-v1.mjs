import crypto from 'node:crypto';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const canonical = (value) => value === null || typeof value !== 'object'
  ? JSON.stringify(value)
  : Array.isArray(value)
    ? `[${value.map(canonical).join(',')}]`
    : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
const jsonl = (rows) => `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
const countBy = (rows, selector) => {
  const counts = {};
  for (const row of rows) {
    const key = selector(row);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
};

function verifyLanguageInventory(inventory) {
  const { inventorySha256, ...body } = inventory ?? {};
  if (body.schema !== 'atlas.language-coverage-inventory.v2'
    || body.canonicalAuthority !== false
    || body.writesPerformed !== false
    || inventorySha256 !== sha256(canonical(body))) throw new Error('LANGUAGE_INVENTORY_CHECKSUM_OR_AUTHORITY_INVALID');
}

function verifyMatrix(matrix, manifest) {
  const { receiptSha256, ...body } = matrix ?? {};
  if (body.schema !== 'atlas.source-parser-coverage-matrix.v1'
    || receiptSha256 !== sha256(JSON.stringify(body))
    || body.canonicalAuthority !== false
    || body.writesPerformed !== false) throw new Error('SOURCE_MATRIX_RECEIPT_INVALID');
  if (body.rowsSha256 !== sha256(jsonl(body.rows ?? []))) throw new Error('SOURCE_MATRIX_ROWS_CHECKSUM_INVALID');
  if (manifest?.outputs?.matrix?.receiptSha256 !== receiptSha256
    || manifest.outputs.rows?.sha256 !== body.rowsSha256
    || manifest.scope?.sourceCount !== body.scope?.sourceCount) throw new Error('SOURCE_MATRIX_MANIFEST_MISMATCH');
  const { manifestSha256, ...manifestBody } = manifest;
  if (manifestSha256 !== sha256(JSON.stringify(manifestBody))) throw new Error('SOURCE_MATRIX_MANIFEST_CHECKSUM_INVALID');
}

function verifySample(sample) {
  const { receiptSha256, ...body } = sample ?? {};
  if (body.schema !== 'atlas.frozen-source-parser-sample.v2'
    || body.canonicalAuthority !== false
    || body.sourceQualifiedAdmission !== false
    || body.writesPerformed !== false
    || receiptSha256 !== sha256(canonical(body))) throw new Error('PARSER_SAMPLE_RECEIPT_INVALID');
}

export function buildSourceLanguageValidationJoinV1({ languageInventory, sourceMatrix, sourceMatrixManifest, parserSample }) {
  verifyLanguageInventory(languageInventory);
  verifyMatrix(sourceMatrix, sourceMatrixManifest);
  verifySample(parserSample);
  const languages = languageInventory.languageMatrix;
  if (!Array.isArray(languages) || !Array.isArray(sourceMatrix.rows) || !Array.isArray(parserSample.samples)) {
    throw new TypeError('LANGUAGE_JOIN_INPUT_SHAPE_INVALID');
  }

  const profilesByExtension = new Map();
  for (const language of languages) {
    if (typeof language.languageId !== 'string' || !Array.isArray(language.extensions)) throw new Error('LANGUAGE_PROFILE_ROW_INVALID');
    for (const extension of language.extensions) {
      const matches = profilesByExtension.get(extension) ?? [];
      matches.push(language.languageId);
      profilesByExtension.set(extension, matches);
    }
  }
  const sourceRowsByExtension = new Map();
  const sourceRowsByRef = new Map();
  for (const row of sourceMatrix.rows) {
    if (sourceRowsByRef.has(row.sourceRef)) throw new Error(`SOURCE_MATRIX_DUPLICATE_REF:${row.sourceRef}`);
    sourceRowsByRef.set(row.sourceRef, row);
    const extensionRows = sourceRowsByExtension.get(row.extension) ?? [];
    extensionRows.push(row);
    sourceRowsByExtension.set(row.extension, extensionRows);
  }

  const sampleByExtension = new Map();
  for (const sample of parserSample.samples) {
    if (sample.status === 'NO_ROUTED_SAMPLE') continue;
    const matrixRow = sourceRowsByRef.get(sample.sourceRef);
    if (!matrixRow || matrixRow.extension !== sample.extension
      || matrixRow.sourceRevision !== sample.sourceRevision
      || matrixRow.sourceContentDigest !== sample.contentSha256) throw new Error(`PARSER_SAMPLE_SOURCE_BINDING_MISMATCH:${sample.sourceRef}`);
    const rows = sampleByExtension.get(sample.extension) ?? [];
    rows.push(sample);
    sampleByExtension.set(sample.extension, rows);
  }

  const languageRows = languages.map((language) => {
    const extensions = language.extensions.filter((extension) => (profilesByExtension.get(extension) ?? []).length === 1
      && profilesByExtension.get(extension)[0] === language.languageId);
    const sourceRows = extensions.flatMap((extension) => sourceRowsByExtension.get(extension) ?? []);
    const samples = extensions.flatMap((extension) => sampleByExtension.get(extension) ?? []);
    const sampleCounts = countBy(samples, (row) => row.status);
    return {
      languageId: language.languageId,
      profileEvidence: language.profileEvidence,
      extensions,
      physicalInventory: {
        fileCountInCorpus: language.fileCountInCorpus,
        parserCandidateFiles: language.parserCandidateFiles,
        dotPathAuditOnlyFiles: language.dotPathAuditOnlyFiles,
      },
      grammar: {
        catalogMatch: language.grammarCatalogMatch,
        availabilityStatus: language.grammarAvailability,
      },
      rootSourceCohort: {
        sourceCount: sourceRows.length,
        byExtension: Object.fromEntries(extensions.map((extension) => [extension, {
          count: (sourceRowsByExtension.get(extension) ?? []).length,
          routeStatuses: countBy(sourceRowsByExtension.get(extension) ?? [], (row) => row.route.status),
          astCapabilityOutcomes: countBy(sourceRowsByExtension.get(extension) ?? [], (row) => row.astEvidence.capabilityOutcome),
          lineageClasses: countBy(sourceRowsByExtension.get(extension) ?? [], (row) => row.astEvidence.lineageClass),
        }]).filter(([, value]) => value.count > 0)),
        routeStatuses: countBy(sourceRows, (row) => row.route.status),
        astCapabilityOutcomes: countBy(sourceRows, (row) => row.astEvidence.capabilityOutcome),
        lineageClasses: countBy(sourceRows, (row) => row.astEvidence.lineageClass),
      },
      liveParserSample: {
        sampledExtensionCount: samples.length,
        outcomes: sampleCounts,
        sampleSourceRefs: samples.map((row) => row.sourceRef).sort(),
        spanValidation: samples.length ? 'REPLAYED_FOR_SAMPLED_FILES_ONLY' : 'NOT_MEASURED',
      },
      parserOwner: language.parserOwner ?? null,
      parserOwnerStatus: language.parserOwnerStatus,
      parserVersion: language.parserVersion ?? null,
      compilerLspStatus: language.compilerLspStatus,
      canonicalAuthority: false,
    };
  }).sort((left, right) => left.languageId.localeCompare(right.languageId));

  const rootExtensionRows = [...sourceRowsByExtension.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([extension, rows]) => {
    const profileLanguageIds = profilesByExtension.get(extension) ?? [];
    const mappingStatus = profileLanguageIds.length === 0 ? 'UNMAPPED_PROFILE'
      : profileLanguageIds.length === 1 ? 'MAPPED_PROFILE'
        : 'AMBIGUOUS_PROFILE';
    return {
      extension,
      sourceCount: rows.length,
      profileLanguageIds: [...profileLanguageIds].sort(),
      mappingStatus,
      routeStatuses: countBy(rows, (row) => row.route.status),
      parserSamples: countBy(sampleByExtension.get(extension) ?? [], (row) => row.status),
    };
  });

  const body = {
    schema: 'atlas.source-language-validation-join.v1',
    status: 'DERIVED_ADVISORY_LANGUAGE_PROFILE_AND_RUNTIME_EVIDENCE_JOIN',
    canonicalAuthority: false,
    writesPerformed: false,
    sourceScope: sourceMatrix.scope,
    inputs: {
      languageInventorySha256: languageInventory.inventorySha256,
      sourceMatrixReceiptSha256: sourceMatrix.receiptSha256,
      sourceMatrixManifestSha256: sourceMatrixManifest.manifestSha256,
      parserSampleReceiptSha256: parserSample.receiptSha256,
      profileCount: languages.length,
      sourceCount: sourceMatrix.rows.length,
      sampleCount: parserSample.samples.filter((row) => row.sourceRef).length,
    },
    totals: {
      profiles: languageRows.length,
      rootSources: sourceMatrix.rows.length,
      profileMappedRootSources: rootExtensionRows.filter((row) => row.mappingStatus === 'MAPPED_PROFILE').reduce((sum, row) => sum + row.sourceCount, 0),
      ambiguousProfileRootSources: rootExtensionRows.filter((row) => row.mappingStatus === 'AMBIGUOUS_PROFILE').reduce((sum, row) => sum + row.sourceCount, 0),
      unmappedProfileRootSources: rootExtensionRows.filter((row) => row.mappingStatus === 'UNMAPPED_PROFILE').reduce((sum, row) => sum + row.sourceCount, 0),
      sampleStatuses: countBy(parserSample.samples.filter((row) => row.sourceRef), (row) => row.status),
    },
    languages: languageRows,
    rootExtensions: rootExtensionRows,
    limitations: [
      'Grammar catalog presence is a candidate signal, not runtime support proof.',
      'ROUTED means a route exists; it does not prove parse execution or success.',
      'The live parser sample contains at most one file per extension and is not language-wide validation.',
      'The source AST lineage audit did not join compiler/LSP diagnostics or canonical symbol resolution.',
      'This joins the root repository scope only; nested repositories remain outside the source parser matrix.',
      'All outputs are advisory and cannot authorize persistence, graph promotion, ACE admission, or reindexing.',
    ],
  };
  return { ...body, joinSha256: sha256(canonical(body)) };
}

export function verifySourceLanguageValidationJoinV1(join) {
  const { joinSha256, ...body } = join ?? {};
  if (join?.schema !== 'atlas.source-language-validation-join.v1'
    || joinSha256 !== sha256(canonical(body))) throw new Error('SOURCE_LANGUAGE_JOIN_CHECKSUM_INVALID');
  return true;
}

export function sourceLanguageValidationJoinJsonlV1(join) {
  return jsonl(join.languages);
}
