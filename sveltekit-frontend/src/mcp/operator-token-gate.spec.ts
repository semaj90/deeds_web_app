import { describe, expect, it, vi } from 'vitest';
import { operatorTokenDenial, withOperatorTokenGate } from './operator-token-gate.js';

const CONFIGURED = 'operator-secret-0123456789abcdef';

describe('operatorTokenDenial', () => {
	it('rejects a fake non-empty token before an ops writer proceeds', () => {
		expect(operatorTokenDenial('fake-but-nonempty-token', CONFIGURED)).toEqual({
			content: [
				{
					type: 'text',
					text: JSON.stringify({ ok: false, error: 'INVALID_OPERATOR_TOKEN' }),
				},
			],
		});
	});

	it('permits the configured secret', () => {
		expect(operatorTokenDenial(CONFIGURED, CONFIGURED)).toBeNull();
	});

	it('does not invoke a side-effecting handler for a fake token', async () => {
		const write = vi.fn(async () => ({ ok: true }));
		const gatedWrite = withOperatorTokenGate(write, CONFIGURED);

		const result = await gatedWrite({ operator_token: 'fake-but-nonempty-token' });

		expect(result).toMatchObject({ content: [{ text: expect.stringContaining('INVALID_OPERATOR_TOKEN') }] });
		expect(write).not.toHaveBeenCalled();
	});

	it('invokes the side-effecting handler only with the configured secret', async () => {
		const write = vi.fn(async () => ({ ok: true }));
		const gatedWrite = withOperatorTokenGate(write, CONFIGURED);

		await expect(gatedWrite({ operator_token: CONFIGURED })).resolves.toEqual({ ok: true });
		expect(write).toHaveBeenCalledTimes(1);
	});
});
