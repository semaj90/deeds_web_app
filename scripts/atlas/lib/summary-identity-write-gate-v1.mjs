export class SummaryIdentityWriteBlockedError extends Error {
  constructor(writer) {
    super(`SUMMARY_IDENTITY_UNRESOLVED: ${writer} cannot write atlas_summary_layers until its physical, logical, and attempt identities are approved`);
    this.name = 'SummaryIdentityWriteBlockedError';
    this.code = 'SUMMARY_IDENTITY_UNRESOLVED';
  }
}

export function assertSummaryIdentityWriteAdmitted(writer) {
  if (typeof writer !== 'string' || writer.trim().length === 0) {
    throw new TypeError('writer must be a non-empty string');
  }

  throw new SummaryIdentityWriteBlockedError(writer);
}
