import { describe, it, expect } from 'vitest';
import { verifyMcpOperatorToken } from './operator-token-verifier.js';

const CONFIGURED = 'operator-secret-0123456789abcdef';

describe('verifyMcpOperatorToken', () => {
	it('rejects missing, non-string and short supplied tokens', () => {
		expect(verifyMcpOperatorToken(undefined, CONFIGURED).reason).toBe('MISSING_OR_SHORT_OPERATOR_TOKEN');
		expect(verifyMcpOperatorToken(42, CONFIGURED).reason).toBe('MISSING_OR_SHORT_OPERATOR_TOKEN');
		expect(verifyMcpOperatorToken('   ', CONFIGURED).authorized).toBe(false);
		expect(verifyMcpOperatorToken('short', CONFIGURED).authorized).toBe(false);
	});

	it('fails closed when no operator secret is configured', () => {
		const verdict = verifyMcpOperatorToken('any-nonempty-token-value', undefined);
		expect(verdict).toEqual({ authorized: false, actor: null, reason: 'OPERATOR_TOKEN_ENV_UNCONFIGURED' });
	});

	it('rejects arbitrary non-empty tokens when a secret is configured', () => {
		const verdict = verifyMcpOperatorToken('arbitrary-nonempty-token-value', CONFIGURED);
		expect(verdict).toEqual({ authorized: false, actor: null, reason: 'INVALID_OPERATOR_TOKEN' });
	});

	it('accepts the configured operator token and resolves a bounded actor', () => {
		const verdict = verifyMcpOperatorToken(CONFIGURED, CONFIGURED);
		expect(verdict).toEqual({
			authorized: true,
			actor: 'operator:trace-mcp-cli',
			reason: 'VERIFIED_ENV_OPERATOR_TOKEN'
		});
	});

	it('trims surrounding whitespace on both sides before comparing', () => {
		expect(verifyMcpOperatorToken(`  ${CONFIGURED}  `, CONFIGURED).authorized).toBe(true);
	});
});
