import { describe, expect, it, vi } from 'vitest';
import { DispatcherMiddleware, FORBIDDEN_MODEL_TOOLS } from './dispatcher-middleware.js';
import { hashOperatorToken, type OperatorTokenRecordV1 } from '$lib/server/mcp/operator-token-gate-v1.js';

describe('SHELL-EXEC-BOUNDARY-01: Dispatcher shell and process execution boundaries', () => {
  const dummyPool = { connect: vi.fn(async () => ({ query: vi.fn(), release: vi.fn() })) } as any;
  const dummyEngram = { recordObservation: vi.fn() } as any;

  it('declares mandatory forbidden model-facing execution tools', () => {
    expect(FORBIDDEN_MODEL_TOOLS.has('shell.run')).toBe(true);
    expect(FORBIDDEN_MODEL_TOOLS.has('shell.exec')).toBe(true);
    expect(FORBIDDEN_MODEL_TOOLS.has('cmd.run')).toBe(true);
    expect(FORBIDDEN_MODEL_TOOLS.has('cmd.exec')).toBe(true);
    expect(FORBIDDEN_MODEL_TOOLS.has('bash.run')).toBe(true);
    expect(FORBIDDEN_MODEL_TOOLS.has('bash.exec')).toBe(true);
    expect(FORBIDDEN_MODEL_TOOLS.has('terminal.exec')).toBe(true);
    expect(FORBIDDEN_MODEL_TOOLS.has('process.spawn')).toBe(true);
  });

  it('blocks wrapping of forbidden shell.run at registration time', () => {
    const middleware = new DispatcherMiddleware(dummyPool, dummyEngram, null, false);
    const handler = vi.fn(async () => ({ result: 'should-never-run' }));

    expect(() => {
      middleware.wrap(handler, 'shell.run', 'session-shell-block');
    }).toThrowError(/SECURITY_VIOLATION: Direct shell\/process execution tool 'shell.run' is forbidden/);

    expect(handler).not.toHaveBeenCalled();
  });

  it('blocks wrapping of any shell, cmd, or bash prefix tools', () => {
    const middleware = new DispatcherMiddleware(dummyPool, dummyEngram, null, false);
    const handler = vi.fn(async () => ({ result: 'never' }));

    for (const toolName of ['shell.exec', 'bash.run', 'cmd.exec']) {
      expect(() => {
        middleware.wrap(handler, toolName, 'session-test');
      }).toThrowError(/SECURITY_VIOLATION/);
    }

    expect(handler).not.toHaveBeenCalled();
  });

  it('permits safe model-facing intelligence tools', async () => {
    const middleware = new DispatcherMiddleware(dummyPool, dummyEngram, null, false);
    const handler = vi.fn(async (input: any) => ({ results: [`search for ${input.query}`] }));

    const wrapped = middleware.wrap(handler, 'atlas.query', 'session-allowed', 'READ_ONLY');
    const res = await wrapped({ query: 'contracts' });

    expect(handler).toHaveBeenCalledWith({ query: 'contracts' }, expect.anything());
    expect(res).toMatchObject({ results: ['search for contracts'] });
  });

  describe('Operator token gate enforcement for ops.* tools', () => {
    const validSecret = 'operator-secret-token-12345';
    const validTokenHash = hashOperatorToken(validSecret);
    const testRegistry: OperatorTokenRecordV1[] = [
      {
        id: 'op-admin-1',
        tokenHash: validTokenHash,
        scopes: ['ops.run_quality_gate', 'ops.run_targeted_test'],
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        revoked: false,
        issuedBy: 'operator-authority',
      },
      {
        id: 'op-revoked-1',
        tokenHash: hashOperatorToken('revoked-secret'),
        scopes: ['ops.run_quality_gate'],
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        revoked: true,
        issuedBy: 'operator-authority',
      },
    ];

    it('denies ops.* invocation when token is missing', async () => {
      const middleware = new DispatcherMiddleware(dummyPool, dummyEngram, null, false, testRegistry);
      const handler = vi.fn(async () => ({ success: true }));

      const wrapped = middleware.wrap(handler, 'ops.run_quality_gate', 'session-ops-gate');

      await expect(wrapped({ args: {} })).rejects.toThrowError(
        /SECURITY_VIOLATION: Operator token gate denied execution of 'ops.run_quality_gate': MISSING_TOKEN/
      );
      expect(handler).not.toHaveBeenCalled();
    });

    it('denies ops.* invocation when token is invalid or unknown', async () => {
      const middleware = new DispatcherMiddleware(dummyPool, dummyEngram, null, false, testRegistry);
      const handler = vi.fn(async () => ({ success: true }));

      const wrapped = middleware.wrap(handler, 'ops.run_quality_gate', 'session-ops-gate');

      await expect(wrapped({ args: {}, operator_token: 'wrong-token' })).rejects.toThrowError(
        /SECURITY_VIOLATION: Operator token gate denied execution of 'ops.run_quality_gate': UNKNOWN_TOKEN/
      );
      expect(handler).not.toHaveBeenCalled();
    });

    it('denies ops.* invocation when token is revoked', async () => {
      const middleware = new DispatcherMiddleware(dummyPool, dummyEngram, null, false, testRegistry);
      const handler = vi.fn(async () => ({ success: true }));

      const wrapped = middleware.wrap(handler, 'ops.run_quality_gate', 'session-ops-gate');

      await expect(wrapped({ args: {}, operator_token: 'revoked-secret' })).rejects.toThrowError(
        /SECURITY_VIOLATION: Operator token gate denied execution of 'ops.run_quality_gate': REVOKED/
      );
      expect(handler).not.toHaveBeenCalled();
    });

    it('denies ops.* invocation when token scope does not include requested tool', async () => {
      const middleware = new DispatcherMiddleware(dummyPool, dummyEngram, null, false, testRegistry);
      const handler = vi.fn(async () => ({ success: true }));

      const wrapped = middleware.wrap(handler, 'ops.propose_patch', 'session-ops-gate');

      await expect(wrapped({ args: {}, operator_token: validSecret })).rejects.toThrowError(
        /SECURITY_VIOLATION: Operator token gate denied execution of 'ops.propose_patch': SCOPE_DENIED/
      );
      expect(handler).not.toHaveBeenCalled();
    });

    it('allows ops.* invocation when valid token and matching scope are provided', async () => {
      const middleware = new DispatcherMiddleware(dummyPool, dummyEngram, null, false, testRegistry);
      const handler = vi.fn(async () => ({ passed: true, score: 100 }));

      const wrapped = middleware.wrap(handler, 'ops.run_quality_gate', 'session-ops-gate');

      const result = await wrapped({
        check: 'typecheck',
        operator_token: validSecret,
      });

      expect(handler).toHaveBeenCalled();
      expect(result).toMatchObject({ passed: true, score: 100 });
    });
  });
});
