import { createHash, timingSafeEqual } from 'node:crypto';

export interface OperatorTokenVerdict {
	authorized: boolean;
	actor: string | null;
	reason: string;
}

const MIN_TOKEN_LENGTH = 16;

/**
 * Fail-closed check for ops.* operator tools. The supplied token is compared against
 * TRACE_MCP_OPERATOR_TOKEN with a constant-time digest comparison. No token is issued here:
 * the secret is configured by the operator and never printed.
 */
export function verifyMcpOperatorToken(
	suppliedToken: unknown,
	expectedToken: string | undefined = process.env.TRACE_MCP_OPERATOR_TOKEN
): OperatorTokenVerdict {
	if (typeof suppliedToken !== 'string' || suppliedToken.trim().length < MIN_TOKEN_LENGTH) {
		return { authorized: false, actor: null, reason: 'MISSING_OR_SHORT_OPERATOR_TOKEN' };
	}
	const expected = expectedToken?.trim() ?? '';
	if (expected.length < MIN_TOKEN_LENGTH) {
		return { authorized: false, actor: null, reason: 'OPERATOR_TOKEN_ENV_UNCONFIGURED' };
	}
	const supplied = createHash('sha256').update(suppliedToken.trim()).digest();
	const configured = createHash('sha256').update(expected).digest();
	if (timingSafeEqual(supplied, configured)) {
		return { authorized: true, actor: 'operator:trace-mcp-cli', reason: 'VERIFIED_ENV_OPERATOR_TOKEN' };
	}
	return { authorized: false, actor: null, reason: 'INVALID_OPERATOR_TOKEN' };
}
