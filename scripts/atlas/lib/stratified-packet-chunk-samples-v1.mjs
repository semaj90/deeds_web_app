import crypto from 'node:crypto';

const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

const stratumFor = (row) => {
  if (row.classification === 'PROVEN_LINEAGE_MISSING') {
    return Number(row.observedPhysicalChunkRowsByExactSourceRef) > 0
      ? 'LINEAGE_MISSING_WITH_PHYSICAL_CHUNKS'
      : 'LINEAGE_MISSING_WITHOUT_PHYSICAL_CHUNKS';
  }
  if (row.classification === 'PROVEN_LINEAGE_REVISION_MISMATCH') return 'LINEAGE_OTHER_REVISION';
  if (row.classification === 'REPOSITORY_NAMESPACE_MISSING') return 'REPOSITORY_NAMESPACE_MISSING';
  return `OTHER:${row.classification}`;
};

export function buildStratifiedPacketChunkSamplesV1(rows, {
  executionId,
  workspaceRevision,
  limitPerStratum = 10,
} = {}) {
  if (!Array.isArray(rows)) throw new TypeError('PACKET_CHUNK_SAMPLE_ROWS_REQUIRED');
  if (!executionId || !workspaceRevision) throw new TypeError('PACKET_CHUNK_SAMPLE_REVISION_SCOPE_REQUIRED');
  if (!Number.isInteger(limitPerStratum) || limitPerStratum < 1 || limitPerStratum > 100) {
    throw new RangeError('INVALID_PACKET_CHUNK_SAMPLE_LIMIT');
  }

  const strata = new Map();
  for (const row of rows) {
    if (row.classification === 'EXACT_CURRENT_PACKET_CHUNK_BRIDGE') continue;
    const stratum = stratumFor(row);
    const values = strata.get(stratum) ?? [];
    values.push(row);
    strata.set(stratum, values);
  }

  const samples = [];
  const counts = {};
  for (const [stratum, values] of [...strata.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    counts[stratum] = values.length;
    const selected = values
      .slice()
      .sort((left, right) => {
        const leftKey = sha256(`${executionId}\0${workspaceRevision}\0${stratum}\0${left.identity}`);
        const rightKey = sha256(`${executionId}\0${workspaceRevision}\0${stratum}\0${right.identity}`);
        return leftKey.localeCompare(rightKey) || String(left.identity).localeCompare(String(right.identity));
      })
      .slice(0, limitPerStratum);
    for (const row of selected) {
      samples.push({
        stratum,
        identity: row.identity,
        repositoryId: row.repositoryId,
        sourceRef: row.sourceRef,
        sourceRevision: row.sourceRevision,
        workspaceRevision: row.workspaceRevision,
        classification: row.classification,
        exactBindingRowCount: row.exactBindingRowCount,
        bindingRevisionMatches: row.bindingRevisionMatches,
        bindingDigestMatches: row.bindingDigestMatches,
        observedPhysicalChunkRowsByExactSourceRef: row.observedPhysicalChunkRowsByExactSourceRef,
        exactProvenLineageRows: row.exactProvenLineageRows,
        provenLineageRowsAtOtherRevisions: row.provenLineageRowsAtOtherRevisions,
        physicalChunkMissingRows: row.physicalChunkMissingRows,
        canonicalChunkIdMismatchRows: row.canonicalChunkIdMismatchRows,
        packetUnresolvedRows: row.packetUnresolvedRows,
        packetIdentityConflictRows: row.packetIdentityConflictRows,
        packetSourceMismatchRows: row.packetSourceMismatchRows,
      });
    }
  }

  return {
    selection: 'SHA256_RANKED_WITHIN_FAILURE_STRATUM',
    limitPerStratum,
    populationCounts: counts,
    sampleCount: samples.length,
    samples,
  };
}
