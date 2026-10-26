const DECIMAL = /^(0|[1-9][0-9]*)$/;

function asUnsigned(value, field) {
  if (typeof value !== 'string' || !DECIMAL.test(value)) {
    throw new TypeError(`INVALID_USN_${field.toUpperCase()}`);
  }
  return BigInt(value);
}

export function createUsnCheckpointFromRead(readResult) {
  if (!readResult || readResult.ok !== true || readResult.schema !== 'atlas.ntfs-usn-read.v1') {
    return { ok: false, reason: 'USN_READ_RECEIPT_INVALID' };
  }
  if (typeof readResult.volumeId !== 'string' || !readResult.volumeId ||
      typeof readResult.journalId !== 'string' || !readResult.journalId ||
      !Array.isArray(readResult.records) || !Number.isSafeInteger(readResult.recordCount) ||
      readResult.recordCount < 0 || readResult.recordCount !== readResult.records.length ||
      typeof readResult.truncated !== 'boolean') {
    return { ok: false, reason: 'USN_READ_RECEIPT_SHAPE_INVALID' };
  }

  try {
    const startUsn = asUnsigned(readResult.startUsn, 'READ_START');
    const nextReadUsn = asUnsigned(readResult.nextReadUsn, 'READ_NEXT');
    const nextUsn = asUnsigned(readResult.nextUsn, 'READ_LIMIT');
    const lowestValidUsn = asUnsigned(readResult.lowestValidUsn, 'LOWEST_VALID');
    if (nextReadUsn < startUsn || nextReadUsn > nextUsn) {
      return { ok: false, reason: 'USN_READ_RANGE_INVALID' };
    }
    if (nextReadUsn < lowestValidUsn) {
      return { ok: false, reason: 'JOURNAL_GAP_REQUIRES_FULL_SCAN' };
    }
    return {
      ok: true,
      checkpoint: {
        schema: 'atlas.ntfs-usn-checkpoint.v1',
        volumeId: readResult.volumeId,
        journalId: readResult.journalId,
        nextUsn: nextReadUsn.toString(),
      },
    };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export function validateUsnCheckpoint(checkpoint, journal) {
  if (!checkpoint || checkpoint.schema !== 'atlas.ntfs-usn-checkpoint.v1') {
    return { incremental: false, reason: 'CHECKPOINT_SCHEMA_MISMATCH' };
  }
  if (!journal || typeof journal.volumeId !== 'string' || !journal.volumeId ||
      typeof journal.journalId !== 'string' || !journal.journalId) {
    return { incremental: false, reason: 'JOURNAL_IDENTITY_UNAVAILABLE' };
  }
  if (checkpoint.volumeId !== journal.volumeId) {
    return { incremental: false, reason: 'VOLUME_ID_MISMATCH' };
  }
  if (checkpoint.journalId !== journal.journalId) {
    return { incremental: false, reason: 'JOURNAL_ID_MISMATCH' };
  }

  let checkpointUsn;
  let lowestValidUsn;
  let nextUsn;
  try {
    checkpointUsn = asUnsigned(checkpoint.nextUsn, 'CHECKPOINT_NEXT');
    lowestValidUsn = asUnsigned(journal.lowestValidUsn, 'LOWEST_VALID');
    nextUsn = asUnsigned(journal.nextUsn, 'NEXT');
  } catch (error) {
    return { incremental: false, reason: error.message };
  }

  if (checkpointUsn < lowestValidUsn) {
    return { incremental: false, reason: 'JOURNAL_GAP_REQUIRES_FULL_SCAN' };
  }
  if (checkpointUsn > nextUsn) {
    return { incremental: false, reason: 'CHECKPOINT_AHEAD_OF_JOURNAL' };
  }
  return { incremental: true, reason: 'CHECKPOINT_CONTIGUOUS', startUsn: checkpointUsn.toString() };
}
