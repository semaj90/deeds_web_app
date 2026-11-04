import { verifyMcpOperatorToken } from './operator-token-verifier.js';

export function operatorTokenDenial(token: unknown, configuredSecret?: string) {
	const verdict = verifyMcpOperatorToken(token, configuredSecret);
	return verdict.authorized
		? null
		: {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify({ ok: false, error: verdict.reason }),
					},
				],
			};
}

type OperatorGatedInput = { operator_token: unknown };

export function withOperatorTokenGate<Input extends OperatorGatedInput, Output>(
	handler: (input: Input) => Promise<Output>,
	configuredSecret?: string
): (input: Input) => Promise<Output | NonNullable<ReturnType<typeof operatorTokenDenial>>> {
	return async (input) => {
		const denial = operatorTokenDenial(input.operator_token, configuredSecret);
		if (denial) return denial;
		return handler(input);
	};
}
