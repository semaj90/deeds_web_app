import { describe, expect, it } from 'vitest';

import { classifyTemporalProofDatabaseSafetyV1 } from './temporal-proof-database-safety.js';

const EXPECTED = 'atlas_proof';

describe('TemporalProofDatabaseSafetyV1', () => {
  it('rejects the known localhost proxy even with explicit disposable confirmation', () => {
    expect(classifyTemporalProofDatabaseSafetyV1({
      databaseUrl: 'postgresql://user:secret@127.0.0.1:5434/legal_ai_db',
      explicitDisposableConfirmation: true,
      expectedDatabaseName: EXPECTED,
    })).toMatchObject({ allowed: false, reason: 'KNOWN_PROXY_TARGET_REJECTED' });

    expect(classifyTemporalProofDatabaseSafetyV1({
      databaseUrl: 'postgresql://user:secret@localhost:5434/legal_ai_db',
      explicitDisposableConfirmation: true,
      expectedDatabaseName: EXPECTED,
    })).toMatchObject({ allowed: false, reason: 'KNOWN_PROXY_TARGET_REJECTED' });
  });

  it('rejects the canonical legal_ai_db identity even through another route', () => {
    expect(classifyTemporalProofDatabaseSafetyV1({
      databaseUrl: 'postgresql://legal_admin:secret@172.18.0.21:5432/legal_ai_db',
      explicitDisposableConfirmation: true,
      expectedDatabaseName: EXPECTED,
    })).toMatchObject({
      allowed: false,
      reason: 'KNOWN_CANONICAL_DATABASE_REJECTED',
      target: '172.18.0.21:5432/legal_ai_db',
      databaseName: 'legal_ai_db',
    });

    expect(classifyTemporalProofDatabaseSafetyV1({
      databaseUrl: 'postgresql://legal_admin:secret@some-alias:6543/legal_ai_db',
      explicitDisposableConfirmation: true,
      expectedDatabaseName: EXPECTED,
    })).toMatchObject({ allowed: false, reason: 'KNOWN_CANONICAL_DATABASE_REJECTED' });
  });

  it('requires an explicit disposable proof confirmation and expected DB identity', () => {
    expect(classifyTemporalProofDatabaseSafetyV1({
      databaseUrl: 'postgresql://user:secret@127.0.0.1:55432/atlas_proof',
      explicitDisposableConfirmation: false,
      expectedDatabaseName: EXPECTED,
    })).toMatchObject({
      allowed: false,
      reason: 'EXPLICIT_DISPOSABLE_CONFIRMATION_REQUIRED',
      target: null,
    });

    expect(classifyTemporalProofDatabaseSafetyV1({
      databaseUrl: 'postgresql://user:secret@127.0.0.1:55432/atlas_proof',
      explicitDisposableConfirmation: true,
      expectedDatabaseName: undefined,
    })).toMatchObject({
      allowed: false,
      reason: 'EXPECTED_DISPOSABLE_DATABASE_REQUIRED',
      target: null,
    });
  });

  it('rejects a different DB name even when the host is otherwise allowed', () => {
    expect(classifyTemporalProofDatabaseSafetyV1({
      databaseUrl: 'postgresql://user:secret@127.0.0.1:55432/not_the_proof_db',
      explicitDisposableConfirmation: true,
      expectedDatabaseName: EXPECTED,
    })).toMatchObject({
      allowed: false,
      reason: 'DATABASE_NAME_MISMATCH',
      databaseName: 'not_the_proof_db',
    });
  });

  it('admits only the explicitly named disposable PostgreSQL database', () => {
    expect(classifyTemporalProofDatabaseSafetyV1({
      databaseUrl: 'postgresql://user:secret@127.0.0.1:55432/atlas_proof',
      explicitDisposableConfirmation: true,
      expectedDatabaseName: EXPECTED,
    })).toEqual({
      allowed: true,
      reason: 'ALLOWED_EXPLICIT_DISPOSABLE_TARGET',
      target: '127.0.0.1:55432/atlas_proof',
      databaseName: 'atlas_proof',
    });
  });

  it('rejects missing, malformed, non-Postgres, and database-less URLs', () => {
    expect(classifyTemporalProofDatabaseSafetyV1({ databaseUrl: undefined, explicitDisposableConfirmation: true, expectedDatabaseName: EXPECTED }).reason)
      .toBe('DATABASE_URL_REQUIRED');
    expect(classifyTemporalProofDatabaseSafetyV1({ databaseUrl: 'not a url', explicitDisposableConfirmation: true, expectedDatabaseName: EXPECTED }).reason)
      .toBe('DATABASE_URL_INVALID');
    expect(classifyTemporalProofDatabaseSafetyV1({ databaseUrl: 'redis://localhost:6379/0', explicitDisposableConfirmation: true, expectedDatabaseName: EXPECTED }).reason)
      .toBe('DATABASE_URL_INVALID');
    expect(classifyTemporalProofDatabaseSafetyV1({ databaseUrl: 'postgresql://localhost:55432', explicitDisposableConfirmation: true, expectedDatabaseName: EXPECTED }).reason)
      .toBe('DATABASE_URL_INVALID');
  });
});
