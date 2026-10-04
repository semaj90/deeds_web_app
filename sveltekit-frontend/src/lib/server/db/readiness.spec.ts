import { describe, expect, it } from 'vitest';
import {
  HEALTHY_DATABASE,
  classifyPgIsReadyExit,
  classifyPostgresError,
  shouldCreateRepairTask,
} from './readiness';

describe('classifyPostgresError', () => {
  it('classifies SQLSTATE 57P03 "starting up" as STARTING', () => {
    const error = Object.assign(new Error('the database system is starting up'), { code: '57P03' });
    const result = classifyPostgresError(error);
    expect(result).toMatchObject({ state: 'starting', reason: 'STARTING_UP', sqlstate: '57P03', retryable: true });
  });

  it('classifies a Drizzle-wrapped 57P03 (pg error in .cause) as STARTING', () => {
    const inner = Object.assign(new Error('the database system is starting up'), { code: '57P03' });
    const wrapped = Object.assign(new Error('Failed query: select 1'), { cause: inner });
    expect(classifyPostgresError(wrapped).state).toBe('starting');
  });

  it('classifies recovery mode as STARTING', () => {
    const result = classifyPostgresError(new Error('the database system is in recovery mode'));
    expect(result).toMatchObject({ state: 'starting', reason: 'IN_RECOVERY' });
  });

  it('does not treat "shutting down" (also 57P03) as STARTING', () => {
    const error = Object.assign(new Error('the database system is shutting down'), { code: '57P03' });
    expect(classifyPostgresError(error)).toMatchObject({ state: 'unavailable', reason: 'SHUTTING_DOWN' });
  });

  it('does not treat ECONNREFUSED alone as STARTING', () => {
    const error = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5434'), { code: 'ECONNREFUSED' });
    expect(classifyPostgresError(error)).toMatchObject({ state: 'unavailable', reason: 'CONNECTION_REFUSED', retryable: true });
  });

  it('classifies auth/config failures as non-retryable UNAVAILABLE', () => {
    const error = Object.assign(new Error('password authentication failed'), { code: '28P01' });
    expect(classifyPostgresError(error)).toMatchObject({ state: 'unavailable', reason: 'AUTH_OR_CONFIG', retryable: false });
  });

  it('is safe on non-error input', () => {
    expect(classifyPostgresError(undefined).state).toBe('unavailable');
    expect(classifyPostgresError('the database system is starting up').state).toBe('starting');
  });
});

describe('classifyPgIsReadyExit', () => {
  it('maps pg_isready exit codes', () => {
    expect(classifyPgIsReadyExit(0).state).toBe('healthy');
    expect(classifyPgIsReadyExit(1).state).toBe('starting');
    expect(classifyPgIsReadyExit(2).state).toBe('unavailable');
    expect(classifyPgIsReadyExit(3)).toMatchObject({ state: 'unavailable', retryable: false });
  });
});

describe('shouldCreateRepairTask', () => {
  it('never opens a repair task for STARTING, HEALTHY, or retryable transients', () => {
    expect(shouldCreateRepairTask(HEALTHY_DATABASE)).toBe(false);
    expect(shouldCreateRepairTask(classifyPgIsReadyExit(1))).toBe(false);
    expect(shouldCreateRepairTask(classifyPostgresError(Object.assign(new Error('x'), { code: '57P03' })))).toBe(false);
    expect(shouldCreateRepairTask(classifyPostgresError('the database system is starting up'))).toBe(false);
    expect(shouldCreateRepairTask(classifyPostgresError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' })))).toBe(false);
  });

  it('opens a repair task only for non-retryable UNAVAILABLE', () => {
    const error = Object.assign(new Error('password authentication failed'), { code: '28P01' });
    expect(shouldCreateRepairTask(classifyPostgresError(error))).toBe(true);
  });
});
